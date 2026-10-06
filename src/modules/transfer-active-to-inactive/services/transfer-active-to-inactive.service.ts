import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferActiveToInactiveEntity } from '../entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from '../entities/approval-level.entity';
import { TransferActiveToInactiveStatus } from '../enums/transfer-status.enum';
import {
  CreateTransferDto,
  AtasanItemDto,
  ArsipItemDto,
} from '../dto/transfer.dto';
import {
  VerifyTransferDto,
  ApproveTransferDto,
  RejectTransferDto,
  FinalVerifyTransferDto,
  VerifyPhysicalFilesDto,
  TuApproveDto,
  FinalApprovalTuDto,
} from '../dto/transfer.dto';
import { TransferFilterDto } from '../dto/transfer-filter.dto';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditModule } from '../../audit/enums/audit-module.enum';
import { AuditStatus } from '../../audit/enums/audit-status.enum';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities/notification.entity';
import { Berkas, StatusBerkas } from '../../berkas/entities/berkas.entity';
import { ArsipDinamisService } from '../../arsip-dinamis/services/arsip-dinamis.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { OrganizationTuService } from '../../organization-tu/organization-tu.service';
import { GeneratePdfService } from '../../generate_pdf/generate_pdf.service';
import { StorageService } from '../../storage/services/storage.service';
import { isEvpOrAbovePosition } from '../../../common/helpers/evp-access.helper';
import { isDivisionSecretary } from '../../../common/helpers/division-secretary-access.helper';

/** Status per-level approval. */
const LEVEL_MENUNGGU = 'MENUNGGU';
const LEVEL_DISETUJUI = 'DISETUJUI';
const LEVEL_DITOLAK = 'DITOLAK';

/**
 * Service untuk pemindahan arsip aktif ke inaktif.
 * 2 Unit: Unit Kerja (Sekretaris + Atasan Managerial)
 *   → Unit Tata Naskah (TU + Atasan Managerial TU).
 */
@Injectable()
export class TransferActiveToInactiveService {
  private readonly logger = new Logger(TransferActiveToInactiveService.name);

  constructor(
    @InjectRepository(TransferActiveToInactiveEntity)
    private readonly repo: Repository<TransferActiveToInactiveEntity>,
    @InjectRepository(TransferApprovalLevelEntity)
    private readonly levelRepo: Repository<TransferApprovalLevelEntity>,
    @InjectRepository(Berkas)
    private readonly berkasRepo: Repository<Berkas>,
    private readonly auditTrailService: AuditTrailService,
    private readonly notificationService: NotificationService,
    private readonly arsipDinamisService: ArsipDinamisService,
    private readonly orgDataService: OrgDataService,
    private readonly organizationTuService: OrganizationTuService,
    private readonly generatePdfService: GeneratePdfService,
    private readonly storageService: StorageService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────────────────────

  /**
   * Resolve sekretarisName dari org_data jika tersimpan sebagai persnum (angka).
   * Dipakai di findAll untuk memastikan nama sekretaris tampil benar.
   */
  private async resolveSekretarisNames(
    items: TransferActiveToInactiveEntity[],
  ): Promise<void> {
    // Cari item yang sekretarisName-nya berupa angka (persnum, bukan nama).
    const needsResolve = items.filter(
      (item) =>
        item.sekretarisName && /^\d+$/.test(String(item.sekretarisName).trim()),
    );
    if (needsResolve.length === 0) return;

    try {
      const latestOrg = await this.orgDataService.findLatestOrg();
      if (!latestOrg?.position_json) return;
      const positions = latestOrg.position_json as any[];

      for (const item of needsResolve) {
        const pos = positions.find(
          (p) =>
            p.persnum_person != null &&
            String(p.persnum_person) === String(item.sekretarisName),
        );
        if (pos?.persnum_person_text) {
          item.sekretarisName = pos.persnum_person_text;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Failed to resolve sekretaris names from org_data: ${e?.message}`,
      );
    }
  }

  private assertDivisionSecretary(user: any): void {
    if (!isDivisionSecretary(user)) {
      throw new ForbiddenException(
        'Pemindahan arsip hanya dapat diakses oleh Sekretaris Divisi',
      );
    }
  }

  async create(
    dto: CreateTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    this.assertDivisionSecretary(user);
    // ── Validasi ──────────────────────────────────────────────────────
    if (!dto.atasanList || dto.atasanList.length === 0) {
      throw new BadRequestException('Minimal pilih 1 atasan');
    }
    if (!dto.arsipList || dto.arsipList.length === 0) {
      throw new BadRequestException('Minimal pilih 1 arsip');
    }
    // Cek duplikat atasan
    const atasanPersnums = dto.atasanList.map((a) => Number(a.persnum));
    if (new Set(atasanPersnums).size !== atasanPersnums.length) {
      throw new BadRequestException('Tidak boleh ada atasan duplikat');
    }
    // Cek duplikat arsip
    const arsipIds = dto.arsipList.map((a) => a.id);
    if (new Set(arsipIds).size !== arsipIds.length) {
      throw new BadRequestException('Tidak boleh ada arsip duplikat');
    }
    // Atasan pertama tidak boleh sama dengan Sekretaris
    if (atasanPersnums[0] === Number(user.persnum)) {
      throw new BadRequestException(
        'Atasan pertama tidak boleh sama dengan Sekretaris (pengusul)',
      );
    }

    const nomorUsulan = await this.generateNomorUsulan();
    const status = dto.submit
      ? TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN
      : TransferActiveToInactiveStatus.DRAFT;

    const firstAtasan = dto.atasanList[0];
    const firstArsip = dto.arsipList[0];

    // Tanggal partisi: tanggal_dibuat berkas pertama, fallback sekarang.
    const berkasPembuat = await this.berkasRepo.findOne({
      where: { id: firstArsip.id },
      select: ['tanggalDibuat'],
    });

    const entity = this.repo.create({
      nomorUsulan,
      tanggal: berkasPembuat?.tanggalDibuat ?? new Date(),
      tanggalUsulan: dto.tanggalUsulan
        ? new Date(dto.tanggalUsulan)
        : new Date(),
      sekretarisPersnum: Number(user.persnum),
      sekretarisName: user.nama ?? String(user.persnum),
      divisiId: user.organization ? Number(user.organization) : null,
      divisiName: user.organizationText ?? null,
      // Kolom legacy (dari atasan pertama)
      atasanPersnum: Number(firstAtasan.persnum),
      atasanName: firstAtasan.name ?? String(firstAtasan.persnum),
      atasanPositionId: firstAtasan.positionId ?? null,
      // Multi-level tracking
      currentApprovalLevel: 1,
      totalApprovalLevels: dto.atasanList.length,
      // Kolom legacy (dari arsip pertama)
      arsipId: firstArsip.id,
      arsipPerihal: firstArsip.perihal ?? '-',
      arsipKode: firstArsip.kode ?? null,
      tanggalRetensiAktifHabis: firstArsip.tanggalRetensiHabis
        ? new Date(firstArsip.tanggalRetensiHabis)
        : null,
      // Multi-arsip
      arsipIds: dto.arsipList.map((a) => ({
        id: a.id,
        perihal: a.perihal ?? '-',
        kode: a.kode ?? null,
        tanggalRetensiHabis: a.tanggalRetensiHabis ?? null,
      })),
      keterangan: dto.keterangan ?? null,
      // Pejabat BAC (Berita Acara)
      bacPihakPertamaPersnum: dto.bacPihakPertamaPersnum ?? null,
      bacPihakPertamaName: dto.bacPihakPertamaName ?? null,
      bacPihakPertamaJabatan: dto.bacPihakPertamaJabatan ?? null,
      bacTembusan: (dto.bacTembusan ?? []).map((t) => ({
        persnum: Number(t.persnum),
        name: t.name ?? '',
        jabatan: t.jabatan ?? '',
      })),
      status,
    });

    const saved = await this.repo.save(entity);

    // ── Simpan daftar atasan ke transfer_approval_levels ────────────
    const levels: TransferApprovalLevelEntity[] = dto.atasanList.map(
      (a: AtasanItemDto, idx: number) =>
        this.levelRepo.create({
          transferId: saved.id,
          tanggal: saved.tanggal ?? new Date(),
          atasanPersnum: Number(a.persnum),
          atasanName: a.name ?? String(a.persnum),
          atasanPositionId: a.positionId ?? null,
          atasanPositionText: a.positionText ?? null,
          urutan: idx + 1,
          status: LEVEL_MENUNGGU,
        }),
    );
    await this.levelRepo.save(levels);

    this.logAudit(
      user,
      saved,
      null,
      saved.status,
      `Membuat usulan pemindahan arsip aktif ke inaktif (${dto.atasanList.length} atasan, ${dto.arsipList.length} arsip)`,
    );

    if (dto.submit) {
      // Notifikasi atasan pertama (yang sedang giliran)
      await this.notify(
        saved,
        firstAtasan.positionId != null ? String(firstAtasan.positionId) : null,
        Number(firstAtasan.persnum),
        'Verifikasi Usulan Pemindahan Arsip Aktif ke Inaktif',
      );
    }
    return saved;
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────

  /** Update usulan (hanya DRAFT atau DITOLAK_ATASAN). */
  async update(
    id: string,
    dto: CreateTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    this.assertDivisionSecretary(user);
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.DRAFT &&
      item.status !== TransferActiveToInactiveStatus.DITOLAK_ATASAN
    ) {
      throw new BadRequestException(
        `Usulan dengan status ${item.status} tidak bisa diedit`,
      );
    }

    // ── Validasi ──────────────────────────────────────────────────────
    if (!dto.atasanList || dto.atasanList.length === 0) {
      throw new BadRequestException('Minimal pilih 1 atasan');
    }
    if (!dto.arsipList || dto.arsipList.length === 0) {
      throw new BadRequestException('Minimal pilih 1 arsip');
    }
    const atasanPersnums = dto.atasanList.map((a) => Number(a.persnum));
    if (new Set(atasanPersnums).size !== atasanPersnums.length) {
      throw new BadRequestException('Tidak boleh ada atasan duplikat');
    }
    const arsipIds = dto.arsipList.map((a) => a.id);
    if (new Set(arsipIds).size !== arsipIds.length) {
      throw new BadRequestException('Tidak boleh ada arsip duplikat');
    }
    if (atasanPersnums[0] === Number(user.persnum)) {
      throw new BadRequestException(
        'Atasan pertama tidak boleh sama dengan Sekretaris (pengusul)',
      );
    }

    const oldStatus = item.status;
    const firstAtasan = dto.atasanList[0];
    const firstArsip = dto.arsipList[0];

    // Debug log
    this.logger.log(
      `[update] id=${id} atasanList=${JSON.stringify(dto.atasanList.map((a) => ({ persnum: a.persnum, name: a.name })))} submit=${dto.submit}`,
    );

    // Update kolom utama
    item.keterangan = dto.keterangan ?? null;
    // Pejabat BAC (Berita Acara)
    if (dto.bacPihakPertamaPersnum !== undefined) {
      item.bacPihakPertamaPersnum = dto.bacPihakPertamaPersnum ?? null;
      item.bacPihakPertamaName = dto.bacPihakPertamaName ?? null;
      item.bacPihakPertamaJabatan = dto.bacPihakPertamaJabatan ?? null;
    }
    if (dto.bacTembusan !== undefined) {
      item.bacTembusan = (dto.bacTembusan ?? []).map((t) => ({
        persnum: Number(t.persnum),
        name: t.name ?? '',
        jabatan: t.jabatan ?? '',
      }));
    }
    // Kolom legacy (dari atasan pertama)
    item.atasanPersnum = Number(firstAtasan.persnum);
    item.atasanName = firstAtasan.name ?? String(firstAtasan.persnum);
    item.atasanPositionId = firstAtasan.positionId ?? null;
    item.totalApprovalLevels = dto.atasanList.length;
    // Kolom legacy (dari arsip pertama)
    item.arsipId = firstArsip.id;
    item.arsipPerihal = firstArsip.perihal ?? '-';
    item.arsipKode = firstArsip.kode ?? null;
    item.tanggalRetensiAktifHabis = firstArsip.tanggalRetensiHabis
      ? new Date(firstArsip.tanggalRetensiHabis)
      : null;
    // Multi-arsip
    item.arsipIds = dto.arsipList.map((a) => ({
      id: a.id,
      perihal: a.perihal ?? '-',
      kode: a.kode ?? null,
      tanggalRetensiHabis: a.tanggalRetensiHabis ?? null,
    }));

    // Jika submit, kirim ke atasan
    if (dto.submit) {
      item.status = TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN;
      item.rejectedNote = null;
      item.currentApprovalLevel = 1;
      // Reset tanggal usulan ke sekarang agar muncul di paling atas tabel
      item.tanggalUsulan = new Date();
    }

    const saved = await this.repo.save(item);

    // ── Replace approval levels ───────────────────────────────────────
    await this.levelRepo
      .createQueryBuilder()
      .delete()
      .from(TransferApprovalLevelEntity)
      .where('transfer_id = :tid', { tid: saved.id })
      .execute();
    const levels: TransferApprovalLevelEntity[] = dto.atasanList.map(
      (a: AtasanItemDto, idx: number) =>
        this.levelRepo.create({
          transferId: saved.id,
          tanggal: saved.tanggal ?? new Date(),
          atasanPersnum: Number(a.persnum),
          atasanName: a.name ?? String(a.persnum),
          atasanPositionId: a.positionId ?? null,
          atasanPositionText: a.positionText ?? null,
          urutan: idx + 1,
          status: LEVEL_MENUNGGU,
        }),
    );
    await this.levelRepo.save(levels);

    this.logAudit(
      user,
      saved,
      oldStatus,
      saved.status,
      `Edit usulan pemindahan arsip aktif ke inaktif (${dto.atasanList.length} atasan, ${dto.arsipList.length} arsip)`,
    );

    if (dto.submit) {
      // Notifikasi atasan level 1
      const currentLevel = await this.getLevel(saved.id, 1);
      if (currentLevel) {
        await this.notify(
          saved,
          currentLevel.atasanPositionId != null
            ? String(currentLevel.atasanPositionId)
            : null,
          currentLevel.atasanPersnum,
          'Verifikasi Usulan Pemindahan Arsip Aktif ke Inaktif',
        );
      }
    }
    return saved;
  }

  // ─── READ ─────────────────────────────────────────────────────────────

  /**
   * Cek apakah user pernah dipilih sebagai atasan managerial di usulan apapun.
   * Jika ya, user berhak melihat menu "Verifikasi Usulan" meskipun role-nya USER.
   */
  async isAtasanManagerial(user: any): Promise<boolean> {
    try {
      const persnum = Number(user?.persnum);
      if (!persnum || isNaN(persnum)) return false;
      const count = await this.levelRepo
        .createQueryBuilder('l')
        .where('l.atasan_persnum = :p', { p: persnum })
        .getCount();
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Daftar arsip tersedia untuk pemindahan (dari Berkas Saya user login).
   * Filter: status Tertutup, retensi aktif habis, belum masuk usulan aktif.
   */
  async getArsipTersedia(user: any) {
    this.assertDivisionSecretary(user);
    const userId = Number(user.persnum);
    const today = new Date().toISOString().split('T')[0];

    // Evaluasi retensi on-demand: berkas yang retensinya habis langsung
    // tersedia untuk dipindahkan, tanpa menunggu cron 2AM.
    await this.arsipDinamisService.tutupBerkasRetensiHabis();

    // 1. Ambil berkas milik user, status Tertutup, retensi aktif habis
    const berkasQb = this.berkasRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');
    berkasQb.andWhere(
      '(b.created_by = :userId OR b.pic_persnum = :userPersnum)',
      {
        userId,
        userPersnum: String(userId),
      },
    );
    const berkasList = await berkasQb
      .andWhere('(b.status = :closed OR b.status = :inaktif)', {
        closed: 'closed_retensi_aktif',
        inaktif: 'retensi_inaktif',
      })
      .andWhere('b.tanggal_retensi_aktif_berakhir IS NOT NULL')
      .andWhere('b.tanggal_retensi_aktif_berakhir <= :today', { today })
      .orderBy('b.tanggal_retensi_aktif_berakhir', 'ASC')
      .getMany();

    if (berkasList.length === 0) return [];

    // 2. Ambil semua usulan yang belum Selesai (arsipIds JSON berisi id arsip)
    const activeUsulan = await this.repo
      .createQueryBuilder('t')
      .select(['t.id', 't.arsipIds', 't.arsipId', 't.status'])
      .where('t.status != :s', { s: TransferActiveToInactiveStatus.SELESAI })
      .andWhere('t.sekretaris_persnum = :p', { p: userId })
      .getMany();

    // Kumpulkan semua arsip id yang sudah masuk usulan aktif
    const arsipDiproses = new Set<string>();
    for (const u of activeUsulan) {
      if (u.arsipIds && Array.isArray(u.arsipIds)) {
        for (const a of u.arsipIds) arsipDiproses.add(a.id);
      }
      arsipDiproses.add(u.arsipId);
    }

    // 3. Map ke format response, tandai yang sedang diproses
    return berkasList.map((b) => ({
      id: b.id,
      label: `${b.kodeBerkas ?? '-'} — ${b.judulBerkas}`,
      perihal: b.judulBerkas,
      kodeBerkas: b.kodeBerkas,
      klasifikasi: b.klasifikasiTeks ?? b.klasifikasi,
      retensiAktif: b.retensiAktifTahun,
      retensiInaktif: b.retensiInaktifTahun,
      tanggalRetensiAktifHabis: b.tanggalRetensiAktifBerakhir,
      status: b.status,
      lokasiFisik: b.lokasi,
      fileUrl: b.dokumenPendukung ?? b.fotoLokasiFisik ?? null,
      sedangDiproses: arsipDiproses.has(b.id),
    }));
  }

  /**
   * Auto-integrasi: berkas yang statusnya closed_retensi_aktif / retensi_inaktif
   * dan belum punya usulan pemindahan apa pun → langsung dibuatkan usulan DRAFT
   * otomatis (atasan masih kosong, diisi user lewat tombol "Kirim").
   * Dipanggil on-demand sebelum tabel gabungan dibaca; idempotent.
   */
  async syncDraftUsulanOtomatis(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const berkasList = await this.berkasRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('(b.status = :closed OR b.status = :inaktif)', {
        closed: StatusBerkas.CLOSED_RETENSI_AKTIF,
        inaktif: StatusBerkas.RETAIL_INAKTIF,
      })
      .andWhere('b.tanggal_retensi_aktif_berakhir IS NOT NULL')
      .andWhere('b.tanggal_retensi_aktif_berakhir <= :today', { today })
      .getMany();
    if (berkasList.length === 0) return 0;

    // Semua arsip yang sudah terdaftar di usulan (status apapun, termasuk
    // SELESAI — berkas yang pernah diusulkan tidak di-draft ulang).
    // NOTE: select() pakai nama PROPERTI (bukan kolom) agar TypeORM memetakannya.
    const usulans = await this.repo
      .createQueryBuilder('t')
      .select(['t.id', 't.arsipId', 't.arsipIds'])
      .getMany();
    const arsipSudahUsulan = new Set<string>();
    for (const u of usulans) {
      if (u.arsipIds && Array.isArray(u.arsipIds)) {
        for (const a of u.arsipIds) arsipSudahUsulan.add(a.id);
      }
      arsipSudahUsulan.add(u.arsipId);
    }

    let count = 0;
    for (const b of berkasList) {
      if (arsipSudahUsulan.has(b.id)) continue;

      // Insert SQL mentah dengan kolom EKSPLISIT: repo.save()/insert() TypeORM
      // meng-generate SEMUA kolom entity (yang tidak diisi jadi DEFAULT) dan
      // gagal bila tabel DB ketinggalan kolom entity (mis. kolom penataan).
      await this.repo.manager.query(
        `INSERT INTO transfer_active_to_inactive
          (id, nomor_usulan, tgl_usulan, sekretaris_persnum, sekretaris_name,
           atasan_persnum, atasan_name, atasan_position_id,
           current_approval_level, total_approval_levels,
           arsip_id, arsip_perihal, arsip_kode, tgl_retensi_aktif_habis,
           arsip_ids, keterangan, status, tanggal)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          await this.generateNomorUsulan(),
          new Date(),
          Number(b.createdBy) || Number(b.picPersnum) || 0,
          String(b.picPersnum ?? b.createdBy ?? ''),
          // Atasan dilengkapi user saat mengirim (kolom NOT NULL, sentinel dulu)
          0,
          '-',
          null,
          0,
          0,
          b.id,
          b.judulBerkas,
          b.kodeBerkas,
          b.tanggalRetensiAktifBerakhir ?? null,
          JSON.stringify([
            {
              id: b.id,
              perihal: b.judulBerkas,
              kode: b.kodeBerkas ?? null,
              tanggalRetensiHabis: b.tanggalRetensiAktifBerakhir ?? null,
            },
          ]),
          'Dibuat otomatis: masa retensi aktif berkas telah habis',
          TransferActiveToInactiveStatus.DRAFT,
          b.tanggalDibuat ?? new Date(),
        ],
      );
      // Cegah duplikat dalam satu run
      arsipSudahUsulan.add(b.id);
      count++;
    }
    return count;
  }

  /**
   * Tabel gabungan: arsip Tertutup dari Berkas Saya (belum jadi usulan)
   * + usulan pemindahan yang sudah dibuat.
   * Return satu array dengan flag isUsulan.
   */
  async getGabungan(
    user: any,
    filter?: {
      search?: string;
      status?: string;
      klasifikasi?: string;
      tahun?: string;
    },
  ) {
    this.assertDivisionSecretary(user);
    const userId = Number(user.persnum);
    const today = new Date().toISOString().split('T')[0];
    const search = filter?.search?.trim() || '';
    const filterKlasifikasi = filter?.klasifikasi?.trim() || '';
    const filterTahun = filter?.tahun?.trim() || '';

    // Evaluasi retensi on-demand: status berkas di tabel gabungan selalu segar.
    await this.arsipDinamisService.tutupBerkasRetensiHabis();
    // Auto-integrasi: berkas yang retensinya habis langsung jadi usulan DRAFT.
    await this.syncDraftUsulanOtomatis();

    // 1. Ambil hanya usulan milik sekretaris yang sedang login.
    const usulanQb = this.repo
      .createQueryBuilder('t')
      .where('t.sekretaris_persnum = :p', { p: userId })
      .orderBy('t.created_at', 'DESC');
    const usulanList = await usulanQb.getMany();

    // Kumpulkan arsip id yang sudah masuk usulan (semua status)
    const arsipDiUsulan = new Set<string>();
    for (const u of usulanList) {
      if (u.arsipIds && Array.isArray(u.arsipIds)) {
        for (const a of u.arsipIds) arsipDiUsulan.add(a.id);
      }
      arsipDiUsulan.add(u.arsipId);
    }

    // Ambil klasifikasi berkas untuk usulan (lookup by arsipId)
    const usulanArsipIds = usulanList.map((u) => u.arsipId);
    const berkasKlasifikasiMap = new Map<
      string,
      { kode: string; teks: string }
    >();
    if (usulanArsipIds.length > 0) {
      const berkasForUsulan = await this.berkasRepo
        .createQueryBuilder('b')
        .select(['b.id', 'b.klasifikasi', 'b.klasifikasiTeks'])
        .where('b.id IN (:...ids)', { ids: usulanArsipIds })
        .getMany();
      for (const b of berkasForUsulan) {
        berkasKlasifikasiMap.set(b.id, {
          kode: b.klasifikasi ?? '',
          teks: b.klasifikasiTeks ?? b.klasifikasi ?? '-',
        });
      }
    }

    // 2. Ambil berkas Tertutup/Retensi Inaktif yang BELUM masuk usulan apapun
    const berkasQb = this.berkasRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');
    berkasQb.andWhere(
      '(b.created_by = :userId OR b.pic_persnum = :userPersnum)',
      {
        userId,
        userPersnum: String(userId),
      },
    );
    berkasQb
      .andWhere('(b.status = :closed OR b.status = :inaktif)', {
        closed: 'closed_retensi_aktif',
        inaktif: 'retensi_inaktif',
      })
      .andWhere('b.tanggal_retensi_aktif_berakhir IS NOT NULL')
      .andWhere('b.tanggal_retensi_aktif_berakhir <= :today', { today })
      .orderBy('b.tanggal_retensi_aktif_berakhir', 'ASC');

    const berkasList = await berkasQb.getMany();
    const berkasBelumUsulan = berkasList.filter(
      (b) => !arsipDiUsulan.has(b.id),
    );

    // 3. Gabungkan: arsip belum usulan (isUsulan=false) + usulan (isUsulan=true)
    const rows: any[] = [];

    // Arsip belum jadi usulan → status "Draft"
    for (const b of berkasBelumUsulan) {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (b.kodeBerkas ?? '').toLowerCase().includes(q) ||
          b.judulBerkas.toLowerCase().includes(q);
        if (!match) continue;
      }
      if (filterKlasifikasi) {
        const bk = (b.klasifikasi ?? '').toLowerCase();
        const bkt = (b.klasifikasiTeks ?? '').toLowerCase();
        if (
          bk !== filterKlasifikasi.toLowerCase() &&
          !bkt.includes(filterKlasifikasi.toLowerCase())
        )
          continue;
      }
      if (filterTahun) {
        const tgl = b.tanggalRetensiAktifBerakhir
          ? new Date(b.tanggalRetensiAktifBerakhir).getFullYear().toString()
          : '';
        if (tgl !== filterTahun) continue;
      }
      rows.push({
        id: b.id,
        isUsulan: false,
        kodeBerkas: b.kodeBerkas,
        perihal: b.judulBerkas,
        klasifikasi: b.klasifikasiTeks ?? b.klasifikasi,
        tanggalRetensiAktifHabis: b.tanggalRetensiAktifBerakhir,
        atasanName: null,
        status: 'DRAFT',
        tanggal: b.createdAt,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        lokasiFisik: b.lokasi,
        berkasStatus: b.status,
      });
    }

    // Usulan yang sudah dibuat
    for (const u of usulanList) {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (u.arsipKode ?? '').toLowerCase().includes(q) ||
          u.arsipPerihal.toLowerCase().includes(q) ||
          (u.atasanName ?? '').toLowerCase().includes(q) ||
          u.nomorUsulan.toLowerCase().includes(q);
        if (!match) continue;
      }
      if (filter?.status && u.status !== filter.status) continue;
      if (filterKlasifikasi) {
        const fk = filterKlasifikasi.toLowerCase();
        const entry = berkasKlasifikasiMap.get(u.arsipId);
        const kode = (entry?.kode ?? '').toLowerCase();
        const teks = (entry?.teks ?? '').toLowerCase();
        if (kode !== fk && !teks.includes(fk) && !kode.includes(fk)) continue;
      }
      if (filterTahun) {
        const tgl = u.tanggalUsulan
          ? new Date(u.tanggalUsulan).getFullYear().toString()
          : '';
        if (tgl !== filterTahun) continue;
      }

      rows.push({
        id: u.id,
        isUsulan: true,
        nomorUsulan: u.nomorUsulan,
        kodeBerkas: u.arsipKode,
        perihal: u.arsipPerihal,
        klasifikasi: berkasKlasifikasiMap.get(u.arsipId)?.teks ?? null,
        tanggalRetensiAktifHabis: u.tanggalRetensiAktifHabis
          ? new Date(u.tanggalRetensiAktifHabis).toISOString().split('T')[0]
          : null,
        atasanName: u.atasanName,
        status: u.status,
        tanggal: u.tanggalUsulan,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        currentApprovalLevel: u.currentApprovalLevel,
        totalApprovalLevels: u.totalApprovalLevels,
        // Pejabat BAC — untuk tombol Tanda Tangan (EVP pihak pertama)
        bacPihakPertamaPersnum: u.bacPihakPertamaPersnum,
        bacPihakPertamaName: u.bacPihakPertamaName,
        bacSignedAt: u.bacSignedAt,
        beritaAcaraUrl: u.beritaAcaraUrl,
      });
    }

    // Sort: paling baru di atas (by date DESC) untuk semua baris.
    // Usulan memakai updatedAt (perubahan terakhir), arsip belum usulan memakai tanggal retensi.
    rows.sort((a, b) => {
      const aTime = new Date((a as any).updatedAt ?? a.tanggal).getTime();
      const bTime = new Date((b as any).updatedAt ?? b.tanggal).getTime();
      return bTime - aTime;
    });

    return rows;
  }

  /**
   * BAC yang memang ditugaskan kepada user login sebagai pihak pertama.
   * Endpoint ini menjadi sumber data menu Penandatanganan, sehingga pejabat
   * tidak perlu menjadi sekretaris pengusul untuk melihat BAC yang harus TTE.
   */
  async getSigningList(user: any) {
    if (!isEvpOrAbovePosition(user)) {
      throw new ForbiddenException(
        'Halaman penandatanganan hanya tersedia untuk EVP dan jabatan di atasnya',
      );
    }

    const items = await this.repo
      .createQueryBuilder('t')
      .where('t.bac_pihak_pertama_persnum = :persnum', {
        persnum: Number(user.persnum),
      })
      .andWhere('t.berita_acara_url IS NOT NULL')
      .andWhere('t.bac_signed_at IS NULL')
      .orderBy('t.tgl_usulan', 'DESC')
      .getMany();

    return items.map((item) => ({
      id: item.id,
      nomorUsulan: item.nomorUsulan,
      arsipPerihal: item.arsipPerihal,
      arsipKode: item.arsipKode,
      tanggalUsulan: item.tanggalUsulan,
      status: item.status,
      beritaAcaraNomor: item.beritaAcaraNomor,
      beritaAcaraUrl: item.beritaAcaraUrl,
      bacPihakPertamaName: item.bacPihakPertamaName,
      bacPihakPertamaJabatan: item.bacPihakPertamaJabatan,
      bacTembusanCount: Array.isArray(item.bacTembusan)
        ? item.bacTembusan.length
        : 0,
    }));
  }

  /**
   * Daftar BAC yang diterima user sebagai tembusan.
   * Tembusan bersifat read-only: tidak ikut approval dan tidak dapat TTE.
   */
  async getTembusanList(user: any) {
    if (!isEvpOrAbovePosition(user)) {
      throw new ForbiddenException(
        'Halaman tembusan BAC hanya tersedia untuk EVP dan jabatan di atasnya',
      );
    }

    const items = await this.repo
      .createQueryBuilder('t')
      .where('t.bac_tembusan IS NOT NULL')
      .andWhere('t.berita_acara_url IS NOT NULL')
      .orderBy('t.updated_at', 'DESC')
      .getMany();

    const persnum = Number(user.persnum);
    const copies = items.filter((item) =>
      Array.isArray(item.bacTembusan)
        ? item.bacTembusan.some((copy) => Number(copy?.persnum) === persnum)
        : false,
    );

    return Promise.all(
      copies.map(async (item) => ({
        id: item.id,
        nomorUsulan: item.nomorUsulan,
        arsipPerihal: item.arsipPerihal,
        arsipKode: item.arsipKode,
        tanggalUsulan: item.tanggalUsulan,
        status: item.status,
        beritaAcaraNomor: item.beritaAcaraNomor,
        bacPihakPertamaName: item.bacPihakPertamaName,
        bacPihakPertamaJabatan: item.bacPihakPertamaJabatan,
        bacSignedAt: item.bacSignedAt,
        bacStatus: item.bacSignedAt
          ? 'SUDAH_DITANDATANGANI'
          : 'MENUNGGU_TANDA_TANGAN',
        beritaAcaraUrl: item.bacSignedAt
          ? await this.getBacPreviewUrl(item)
          : null,
      })),
    );
  }

  private async getBacPreviewUrl(
    item: TransferActiveToInactiveEntity,
  ): Promise<string | null> {
    const key = item.beritaAcaraUrl;
    if (!key) return null;

    // Data lama dapat menyimpan URL endpoint/path, sedangkan generator baru
    // menyimpan object key MinIO. Keduanya tetap didukung.
    if (/^(https?:\/\/|\/)/i.test(key)) return key;

    return this.storageService.getPreviewUrl(
      key,
      86_400,
      `BAC-${item.nomorUsulan}.pdf`,
    );
  }

  async findAll(filter: TransferFilterDto, user: any) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('t');
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();

    // Role-based filter
    // TU (Unit Dokumen) dan Sekretaris TU dapat melihat semua usulan SELESAI
    // (untuk pengajuan penyusutan). Sekretaris Divisi biasa tetap hanya melihat
    // usulannya sendiri. Cek dari JWT tuRoles dan organization_tu sebagai
    // fallback jika JWT belum di-refresh.
    const tuRoles: string[] = Array.isArray(user.tuRoles) ? user.tuRoles : [];
    let isTu = tuRoles.includes('tu') || tuRoles.includes('sekretaris');

    // Fallback: cek organization_tu jika tuRoles tidak ada di JWT
    if (!isTu && user.persnum) {
      try {
        const activeRoles =
          await this.organizationTuService.getActiveRolesForPersnum(
            Number(user.persnum),
          );
        isTu = activeRoles.includes('tu') || activeRoles.includes('sekretaris');
      } catch {
        // ignore
      }
    }

    if (isTu && filter.status === 'SELESAI') {
      // TU melihat semua usulan SELESAI — tidak ada filter sekretaris/atasan
    } else if (roleName === 'USER') {
      // Atasan hanya boleh melihat usulan yang sedang berada pada urutan
      // verifikasinya. Gunakan EXISTS langsung agar tidak bergantung pada
      // bentuk alias hasil getRawMany() (yang berbeda antar driver DB).
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1
            FROM transfer_approval_levels active_level
            WHERE active_level.transfer_id = t.id
              AND active_level.atasan_persnum = :currentPersnum
              AND active_level.urutan = t.current_approval_level
          )
          OR t.sekretaris_persnum = :secretaryPersnum
        )`,
        {
          currentPersnum: Number(user.persnum),
          secretaryPersnum: Number(user.persnum),
        },
      );
    } else if (roleName === 'ADMIN' || roleName === 'SUPERADMIN') {
      // Atasan Managerial: tampilkan usulan yang SUDAH giliran dia
      // (currentApprovalLevel = urutan dia di transfer_approval_levels)
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM transfer_approval_levels active_level
          WHERE active_level.transfer_id = t.id
            AND active_level.atasan_persnum = :currentPersnum
            AND active_level.urutan = t.current_approval_level
        )`,
        { currentPersnum: Number(user.persnum) },
      );
    }

    if (filter.status) qb.andWhere('t.status = :s', { s: filter.status });
    if (filter.startDate)
      qb.andWhere('t.tgl_usulan >= :sd', { sd: new Date(filter.startDate) });
    if (filter.endDate) {
      const end = new Date(`${filter.endDate}T23:59:59`);
      qb.andWhere('t.tgl_usulan <= :ed', { ed: end });
    }
    if (filter.search) {
      qb.andWhere(
        '(t.nomor_usulan LIKE :q OR t.arsip_perihal LIKE :q OR t.sekretaris_name LIKE :q)',
        { q: `%${filter.search}%` },
      );
    }

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const allowed = ['createdAt', 'tanggalUsulan', 'status', 'nomorUsulan'];
    qb.orderBy(
      `t.${allowed.includes(sortBy) ? sortBy : 'createdAt'}`,
      sortOrder === 'ASC' ? 'ASC' : 'DESC',
    );
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Resolve sekretarisName dari org_data jika tersimpan sebagai persnum.
    await this.resolveSekretarisNames(data);

    // Load klasifikasi berkas untuk setiap usulan (lookup by arsipId)
    const arsipIds = data.map((d) => d.arsipId).filter(Boolean);
    if (arsipIds.length > 0) {
      const berkasList = await this.berkasRepo
        .createQueryBuilder('b')
        .select(['b.id', 'b.klasifikasi', 'b.klasifikasiTeks'])
        .where('b.id IN (:...ids)', { ids: arsipIds })
        .getMany();
      const klasifikasiMap = new Map<string, { kode: string; teks: string }>();
      for (const b of berkasList) {
        klasifikasiMap.set(b.id, {
          kode: b.klasifikasi ?? '',
          teks: b.klasifikasiTeks ?? b.klasifikasi ?? '-',
        });
      }
      for (const d of data) {
        const k = klasifikasiMap.get(d.arsipId);
        (d as any).arsipKlasifikasi = k?.teks ?? null;
        (d as any).arsipKlasifikasiKode = k?.kode ?? null;
      }
    }

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item)
      throw new NotFoundException(
        'Usulan pemindahan arsip aktif ke inaktif tidak ditemukan',
      );

    // Load approval levels
    const levels = await this.levelRepo.find({
      where: { transferId: id },
      order: { urutan: 'ASC' },
    });
    (item as any).approvalLevels = levels;

    // Load klasifikasi berkas dari tabel berkas (untuk ditampilkan di detail)
    if (item.arsipId) {
      const berkas = await this.berkasRepo
        .createQueryBuilder('b')
        .select([
          'b.id',
          'b.klasifikasi',
          'b.klasifikasiTeks',
          'b.tindakanPenyusutanAkhir',
        ])
        .where('b.id = :id', { id: item.arsipId })
        .getOne();
      if (berkas) {
        (item as any).arsipKlasifikasi =
          berkas.klasifikasiTeks ?? berkas.klasifikasi ?? null;
        (item as any).arsipKlasifikasiKode = berkas.klasifikasi ?? null;
        (item as any).arsipTindakanPenyusutan =
          berkas.tindakanPenyusutanAkhir ?? null;
      }
    }

    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (roleName === 'USER') {
      // User bisa akses jika dia adalah sekretaris pengusul ATAU atasan managerial dari usulan ini
      const isSekretaris = item.sekretarisPersnum === Number(user.persnum);
      const isAtasan = levels.some(
        (l) => l.atasanPersnum === Number(user.persnum),
      );
      const isBacSigner = item.bacPihakPertamaPersnum === Number(user.persnum);
      const isBacCopy = Array.isArray(item.bacTembusan)
        ? item.bacTembusan.some(
            (t) => Number(t?.persnum) === Number(user.persnum),
          )
        : false;
      // Atasan Managerial TU (HERMANA 10010123 / PRIYO 10010970) juga boleh
      // akses detail usulan — mereka verifikasi penerimaan dari TU.
      const isAtasanTu = [10010123, 10010970].includes(Number(user.persnum));
      if (
        !isSekretaris &&
        !isAtasan &&
        !isAtasanTu &&
        !isBacSigner &&
        !isBacCopy
      ) {
        throw new BadRequestException(
          'Anda tidak memiliki akses ke usulan ini',
        );
      }
    }
    return item;
  }

  // ─── UNIT KERJA WORKFLOW ─────────────────────────────────────────────

  async send(id: string, user: any): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.DRAFT &&
      item.status !== TransferActiveToInactiveStatus.DITOLAK_ATASAN
    ) {
      throw new BadRequestException(`Status ${item.status} tidak bisa dikirim`);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN;
    item.rejectedNote = null;
    item.currentApprovalLevel = 1;
    // Reset tanggal usulan ke sekarang agar muncul di paling atas tabel
    item.tanggalUsulan = new Date();
    // Reset semua level ke MENUNGGU
    await this.levelRepo
      .createQueryBuilder()
      .update(TransferApprovalLevelEntity)
      .set({ status: LEVEL_MENUNGGU, verifiedAt: null, catatan: null })
      .where('transfer_id = :tid', { tid: item.id })
      .execute();
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Kirim usulan ke atasan');
    // Notifikasi atasan level 1
    const currentLevel = await this.getLevel(item.id, 1);
    if (currentLevel) {
      await this.notify(
        saved,
        currentLevel.atasanPositionId != null
          ? String(currentLevel.atasanPositionId)
          : null,
        currentLevel.atasanPersnum,
        'Verifikasi Usulan Pemindahan Arsip Aktif ke Inaktif',
      );
    }
    return saved;
  }

  /**
   * Verifikasi (approve) oleh atasan yang sedang giliran.
   * - Cek apakah user login = atasan pada currentApprovalLevel.
   * - Jika ya, update status level → DISETUJUI.
   * - Jika masih ada level berikutnya → status MENUNGGU_VERIFIKASI_ATASAN, currentApprovalLevel++,
   *   notifikasi atasan berikutnya.
   * - Jika sudah level terakhir → DISETUJUI_VERIFIKASI_TERAKHIR (final), notifikasi sekretaris.
   */
  async approve(
    id: string,
    dto: ApproveTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    // Bisa approve dari MENUNGGU_VERIFIKASI_ATASAN (persetujuan awal)
    // atau DISETUJUI_ATASAN (verifikasi berjenjang level 2+)
    if (
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN &&
      item.status !== TransferActiveToInactiveStatus.DISETUJUI_ATASAN
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa disetujui`,
      );
    }

    // Cek giliran atasan
    const currentLevel = await this.getLevel(
      item.id,
      item.currentApprovalLevel,
    );
    if (!currentLevel) {
      throw new BadRequestException('Level verifikasi tidak ditemukan');
    }
    if (currentLevel.atasanPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        `Bukan giliran Anda. Saat ini giliran atasan urutan ${item.currentApprovalLevel} (${currentLevel.atasanName}).`,
      );
    }
    // Cek integritas: atasan tidak boleh verifikasi usulan yang dia buat sendiri
    if (item.sekretarisPersnum === Number(user.persnum)) {
      throw new BadRequestException(
        'Atasan tidak boleh memverifikasi usulan yang dibuat sendiri sebagai Sekretaris',
      );
    }

    const old = item.status;
    item.verifyNote = dto.verifyNote ?? null;
    item.approvedBy = Number(user.persnum);
    item.approvedAt = new Date();

    // Update level saat ini → DISETUJUI (query eksplisit agar hanya level
    // ini yang berubah, bukan semua level — composite PK id+tanggal bisa
    // menyebabkan levelRepo.save() salah target).
    await this.levelRepo
      .createQueryBuilder()
      .update(TransferApprovalLevelEntity)
      .set({
        status: LEVEL_DISETUJUI,
        verifiedAt: new Date(),
        catatan: dto.verifyNote ?? null,
      })
      .where('transfer_id = :tid AND urutan = :urutan', {
        tid: item.id,
        urutan: item.currentApprovalLevel,
      })
      .execute();

    const nextLevel = await this.getLevel(
      item.id,
      item.currentApprovalLevel + 1,
    );

    if (nextLevel) {
      // Masih ada atasan berikutnya → DISETUJUI_ATASAN (Menunggu Verifikasi), giliran next
      item.status = TransferActiveToInactiveStatus.DISETUJUI_ATASAN;
      item.currentApprovalLevel = item.currentApprovalLevel + 1;
      // Update kolom legacy atasan ke atasan berikutnya
      item.atasanPersnum = nextLevel.atasanPersnum;
      item.atasanName = nextLevel.atasanName;
      item.atasanPositionId = nextLevel.atasanPositionId;
      const saved = await this.repo.save(item);
      this.logAudit(
        user,
        saved,
        old,
        saved.status,
        `Persetujuan level ${currentLevel.urutan} oleh ${currentLevel.atasanName} — lanjut ke level ${nextLevel.urutan}`,
      );
      // Notifikasi atasan berikutnya
      await this.notify(
        saved,
        nextLevel.atasanPositionId != null
          ? String(nextLevel.atasanPositionId)
          : null,
        nextLevel.atasanPersnum,
        `Verifikasi Usulan (Tahap ${nextLevel.urutan} dari ${item.totalApprovalLevels})`,
      );
      // Notifikasi sekretaris
      await this.notify(
        saved,
        null,
        saved.sekretarisPersnum,
        `Usulan disetujui atasan tahap ${currentLevel.urutan}, menunggu verifikasi tahap ${nextLevel.urutan}`,
      );
      return saved;
    } else {
      // Atasan terakhir (single ATAU multi-atasan berjenjang).
      // Setelah semua atasan approve → langsung DISETUJUI_VERIFIKASI_TERAKHIR
      // supaya verifikator terakhir dapat meneruskan usulan ke TU. Tidak ada
      // langkah verifikasi terakhir tambahan yang membingungkan.
      item.status =
        TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR;
      // Jangan reset ke level 1. Level terakhir adalah pemilik aksi lanjutan
      // (Kirim ke TU), sehingga daftar verifikasi dan hak aksinya tetap
      // menunjuk ke verifikator terakhir.
      item.currentApprovalLevel = currentLevel.urutan;
      item.approvedBy = Number(user.persnum);
      item.approvedAt = new Date();
      item.verifyNote = dto.verifyNote ?? null;
      item.finalVerifyNote = dto.verifyNote ?? null;
      item.finalVerifiedBy = Number(user.persnum);
      item.finalVerifiedAt = new Date();
      const saved = await this.repo.save(item);
      this.logAudit(
        user,
        saved,
        old,
        saved.status,
        `Persetujuan level ${currentLevel.urutan} oleh ${currentLevel.atasanName} — siap kirim ke TU`,
      );
      await this.notify(
        saved,
        null,
        saved.sekretarisPersnum,
        'Usulan disetujui semua atasan — siap dikirim ke Unit Tata Naskah',
      );
      return saved;
    }
  }

  /**
   * Tolak usulan oleh atasan yang sedang giliran.
   * - Update level saat ini → DITOLAK.
   * - Status usulan → DITOLAK_ATASAN (kembali ke Sekretaris).
   */
  async reject(
    id: string,
    dto: RejectTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN &&
      item.status !== TransferActiveToInactiveStatus.DISETUJUI_ATASAN
    ) {
      throw new BadRequestException(`Status ${item.status} tidak bisa ditolak`);
    }

    // Cek giliran atasan
    const currentLevel = await this.getLevel(
      item.id,
      item.currentApprovalLevel,
    );
    if (!currentLevel) {
      throw new BadRequestException('Level verifikasi tidak ditemukan');
    }
    if (currentLevel.atasanPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        `Bukan giliran Anda. Saat ini giliran atasan urutan ${item.currentApprovalLevel} (${currentLevel.atasanName}).`,
      );
    }
    if (item.sekretarisPersnum === Number(user.persnum)) {
      throw new BadRequestException(
        'Atasan tidak boleh menolak usulan yang dibuat sendiri sebagai Sekretaris',
      );
    }

    const old = item.status;
    item.status = TransferActiveToInactiveStatus.DITOLAK_ATASAN;
    item.rejectedNote = dto.rejectedNote;

    // Update level saat ini → DITOLAK (query eksplisit, sama seperti approve)
    await this.levelRepo
      .createQueryBuilder()
      .update(TransferApprovalLevelEntity)
      .set({
        status: LEVEL_DITOLAK,
        verifiedAt: new Date(),
        catatan: dto.rejectedNote,
      })
      .where('transfer_id = :tid AND urutan = :urutan', {
        tid: item.id,
        urutan: item.currentApprovalLevel,
      })
      .execute();

    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      `Penolakan level ${currentLevel.urutan} oleh ${currentLevel.atasanName}`,
    );
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      `Usulan ditolak oleh atasan tahap ${currentLevel.urutan} (${currentLevel.atasanName})`,
    );
    return saved;
  }

  /**
   * Verifikasi terakhir oleh atasan managerial.
   * Dari MENUNGGU_VERIFIKASI_TERAKHIR → DISETUJUI_VERIFIKASI_TERAKHIR (Siap Kirim ke TU).
   * Di sini atasan melihat Daftar Isi dan Berita Acara Serah Terima.
   */
  async finalVerify(
    id: string,
    dto: FinalVerifyTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !==
      TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diverifikasi terakhir`,
      );
    }
    // Cek integritas
    if (item.sekretarisPersnum === Number(user.persnum)) {
      throw new BadRequestException(
        'Atasan tidak boleh memverifikasi usulan yang dibuat sendiri sebagai Sekretaris',
      );
    }
    // Pada alur berjenjang, verifikasi final dilakukan oleh atasan terakhir.
    await this.assertFinalVerifier(item, user);
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR;
    item.finalVerifyNote = dto.finalVerifyNote ?? null;
    item.finalVerifiedBy = Number(user.persnum);
    item.finalVerifiedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Verifikasi terakhir unit kerja — siap kirim ke TU',
    );
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan telah diverifikasi terakhir — siap dikirim ke Unit Tata Naskah',
    );
    return saved;
  }

  async dispatch(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !==
      TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa dikirim ke Unit Tata Naskah`,
      );
    }
    // Aksi lanjutan hanya boleh dilakukan oleh verifikator terakhir yang
    // menyetujui usulan, bukan verifikator pertama.
    await this.assertFinalVerifier(item, user);
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.DIKIRIM;
    item.tanggalDikirim = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Usulan dikirim ke Unit Tata Naskah',
    );
    // Notifikasi ke TU (positionId 0 sementara — butuh mapping Corporate Secretary Division)
    await this.notify(saved, '0', null, 'Berkas fisik perlu diverifikasi');
    return saved;
  }

  // ─── FLOWCHART BARU: Kirim Usul Pindah → Siapkan Berkas Fisik → Selesai ──

  /** Atasan klik "Kirim Usul Pindah" → USUL_PINDAH_DIKIRIM */
  async kirimUsulPindah(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !==
      TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa dikirim usul pindah`,
      );
    }
    await this.assertFinalVerifier(item, user);
    const old = item.status;
    // Kirim ke TU → status DIKIRIM (Menunggu Verifikasi di TU)
    item.status = TransferActiveToInactiveStatus.DIKIRIM;
    item.tanggalDikirim = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Kirim usulan ke Unit Tata Naskah',
    );
    await this.notify(
      saved,
      '0',
      null,
      'Usulan pemindahan arsip menunggu verifikasi TU',
    );
    return saved;
  }

  /** Sekretaris klik "Siapkan Berkas Fisik" → SIAPKAN_BERKAS_FISIK */
  async siapkanBerkasFisik(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.USUL_PINDAH_DIKIRIM) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa siapkan berkas fisik`,
      );
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Siapkan berkas fisik');
    return saved;
  }

  /** Sekretaris klik "Selesai" → SELESAI */
  async selesaikanUsulan(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diselesaikan`,
      );
    }
    const old = item.status;
    // Setelah berkas fisik disiapkan, usulan masuk ke TU → MENUNGGU_PENERIMAAN
    // (bukan langsung SELESAI — Atasan Managerial TU harus approve)
    item.status = TransferActiveToInactiveStatus.DIKIRIM;
    item.tanggalDikirim = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Usulan dikirim ke Unit Tata Naskah — menunggu penerimaan',
    );
    await this.notify(
      saved,
      '0',
      null,
      'Usulan pemindahan arsip menunggu penerimaan TU',
    );
    return saved;
  }

  /**
   * Atasan Managerial TU menyetujui penerimaan usulan → SELESAI.
   * Endpoint: PATCH /:id/approve-receipt
   */
  async approveReceipt(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    // Bisa approve dari status DIKIRIM (menunggu penerimaan TU)
    if (
      item.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK &&
      item.status !== TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI &&
      item.status !== TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa disetujui penerimaan`,
      );
    }
    if (
      item.status === TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU ||
      item.status ===
        TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      this.assertFinalTuVerifier(item, user);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.SELESAI;
    item.tuFinalApprovedBy = Number(user.persnum);
    item.tuFinalApprovedAt = new Date();
    const saved = await this.repo.save(item);

    // Fix: update berkas status from closed_retensi_aktif → retensi_inaktif
    if (saved.arsipIds && saved.arsipIds.length > 0) {
      const berkasIds = saved.arsipIds.map((a) => a.id);
      await this.berkasRepo
        .createQueryBuilder()
        .update(Berkas)
        .set({ status: StatusBerkas.RETAIL_INAKTIF })
        .where('id IN (:...ids)', { ids: berkasIds })
        .andWhere('status = :status', {
          status: StatusBerkas.CLOSED_RETENSI_AKTIF,
        })
        .execute();
      this.logger.log(
        `Berkas status updated to retensi_inaktif for ${berkasIds.length} berkas.`,
      );
    }

    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Persetujuan penerimaan oleh Atasan Managerial TU — usulan selesai',
    );
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan pemindahan arsip disetujui penerimaan oleh Atasan TU — selesai',
    );
    return saved;
  }

  /** Upload Berkas Fisik & Berita Acara Serah Terima */
  async uploadBerkas(
    id: string,
    dto: { berkasFisikUrl?: string; beritaAcaraSerahTerimaUrl?: string },
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa upload berkas`,
      );
    }
    if (dto.berkasFisikUrl) {
      item.beritaAcaraUrl = dto.berkasFisikUrl;
    }
    if (dto.beritaAcaraSerahTerimaUrl) {
      item.beritaAcaraUrl = dto.beritaAcaraSerahTerimaUrl;
    }
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      item.status,
      saved.status,
      'Upload berkas fisik & berita acara',
    );
    return saved;
  }

  // ─── UNIT TATA NASKAH WORKFLOW ───────────────────────────────────────

  async verifyPhysicalFiles(
    id: string,
    dto: VerifyPhysicalFilesDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diverifikasi berkas fisik`,
      );
    }
    const old = item.status;
    item.physicalChecklist = dto.checklist ?? null;
    item.physicalVerificationNote = dto.physicalVerificationNote ?? null;
    item.physicalVerifiedBy = Number(user.persnum);
    item.physicalVerifiedAt = new Date();
    item.tuPersnum = Number(user.persnum);
    item.tuName = user.nama ?? String(user.persnum);

    if (dto.sesuai) {
      item.status = TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI;
    } else {
      // Tidak sesuai → kembali ke Unit Kerja (status DIKIRIM, Sekretaris perbaiki)
      item.status = TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI;
    }
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      dto.sesuai ? 'Berkas fisik sesuai' : 'Berkas fisik tidak sesuai',
    );

    if (dto.sesuai) {
      await this.notify(
        saved,
        null,
        saved.atasanTuPersnum,
        'Berkas fisik sesuai, perlu persetujuan',
      );
    } else {
      await this.notify(
        saved,
        null,
        saved.sekretarisPersnum,
        'Berkas fisik tidak sesuai, mohon perbaiki',
      );
    }
    return saved;
  }

  async tuApprove(
    id: string,
    dto: TuApproveDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa disetujui TU`,
      );
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU;
    item.tuApprovedBy = Number(user.persnum);
    item.tuApprovedAt = new Date();
    item.atasanTuPersnum = item.atasanTuPersnum ?? Number(user.persnum);
    item.atasanTuName = item.atasanTuName ?? user.nama ?? String(user.persnum);
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Persetujuan TU');
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan disetujui TU',
    );
    return saved;
  }

  async tuReject(
    id: string,
    dto: RejectTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa ditolak TU`,
      );
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.DITOLAK_PERSETUJUAN_TU;
    item.rejectedNote = dto.rejectedNote;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Penolakan TU');
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan ditolak TU',
    );
    return saved;
  }

  async tuFinalApprove(
    id: string,
    dto: FinalApprovalTuDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa final approve TU`,
      );
    }
    this.assertFinalTuVerifier(item, user);
    const old = item.status;
    item.status =
      TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU;
    item.tuFinalApprovedBy = Number(user.persnum);
    item.tuFinalApprovedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Persetujuan terakhir TU');
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan disetujui final oleh atasan TU',
    );
    return saved;
  }

  async tuFinalReject(
    id: string,
    dto: RejectTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa ditolak final TU`,
      );
    }
    this.assertFinalTuVerifier(item, user);
    const old = item.status;
    item.status =
      TransferActiveToInactiveStatus.DITOLAK_PERSETUJUAN_TERAKHIR_TU;
    item.rejectedNote = dto.rejectedNote;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Penolakan final TU');
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan ditolak final oleh atasan TU',
    );
    return saved;
  }

  async receiveArchive(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !==
      TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diterima`,
      );
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA;
    item.receivedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Arsip inaktif diterima');
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Arsip inaktif telah diterima',
    );
    return saved;
  }

  async arrangeArchive(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA) {
      throw new BadRequestException(`Status ${item.status} tidak bisa ditata`);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF;
    item.arrangedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Penataan arsip inaktif');
    return saved;
  }

  async complete(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diselesaikan`,
      );
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.SELESAI;
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Pemindahan arsip aktif ke inaktif selesai',
    );
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Pemindahan arsip aktif ke inaktif selesai',
    );
    return saved;
  }

  // ─── BERITA ACARA ─────────────────────────────────────────────────────

  /**
   * Generate PDF Berita Acara lengkap (BAC + Daftar Berkas + Daftar Isi)
   * lalu merge dengan PDF final naskah-naskah dalam berkas.
   * Hasil di-upload ke MinIO → simpan key di beritaAcaraUrl.
   */
  async generateBacPdf(id: string, user: any): Promise<{ url: string }> {
    const item = await this.getItem(id);
    const isFirstGeneration = !item.beritaAcaraUrl;
    const baData = await this.getBeritaAcaraData(id);
    const daftarIsi = await this.getDaftarIsi(id);

    // 1. Build HTML BAC (Times New Roman, template resmi)
    const html = this.buildBacHtml(item, baData, daftarIsi);

    // 2. Render HTML → PDF via puppeteer (GeneratePdfService)
    const bacBuffer = await this.generatePdfService.generatePdf({
      html: Buffer.from(html, 'utf-8').toString('base64'),
    });

    // 3. Merge: BAC + PDF final naskah dalam berkas (pdf-lib)
    const merged = await this.mergeBacWithNaskah(bacBuffer, item);

    // 4. Upload ke MinIO
    const upload = await this.storageService.uploadBuffer(
      merged,
      `BAC-${item.nomorUsulan}.pdf`,
      'application/pdf',
      'transfer-active-to-inactive/bac',
    );

    // 5. Simpan key + nomor BA
    item.beritaAcaraNomor = `BA/${item.nomorUsulan}`;
    item.beritaAcaraUrl = upload.key;
    await this.repo.save(item);

    // BAC baru tersedia setelah PDF selesai dibuat. Kirim pemberitahuan
    // kepada penandatangan dan seluruh tembusan satu kali pada generasi awal.
    if (isFirstGeneration) {
      if (item.bacPihakPertamaPersnum) {
        await this.notify(
          item,
          null,
          item.bacPihakPertamaPersnum,
          'Penandatanganan Berita Acara Pemindahan Arsip',
          'OPEN_TRANSFER_BAC_SIGNING',
        );
      }
      for (const tembusan of item.bacTembusan ?? []) {
        if (!tembusan?.persnum) continue;
        await this.notify(
          item,
          null,
          Number(tembusan.persnum),
          'Tembusan Berita Acara Pemindahan Arsip',
          'OPEN_TRANSFER_BAC_COPY',
        );
      }
    }

    this.auditTrailService.createAsync({
      action: AuditAction.GENERATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'berita_acara',
      entityId: id,
      description: `Generate berita acara PDF ${item.beritaAcaraNomor}`,
      newValue: { beritaAcaraNomor: item.beritaAcaraNomor, key: upload.key },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
    });

    return { url: upload.url };
  }

  /** Build HTML Berita Acara (template resmi, Times New Roman). */
  private buildBacHtml(
    item: TransferActiveToInactiveEntity,
    baData: any,
    daftarIsi: any,
  ): string {
    const fmt = (d: any): string => {
      if (!d) return '-';
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      const bulan = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];
      return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
    };
    const hari = (d: any): string => {
      if (!d) return '-';
      const days = [
        'Minggu',
        'Senin',
        'Selasa',
        'Rabu',
        'Kamis',
        'Jumat',
        'Sabtu',
      ];
      return days[new Date(d).getDay()];
    };

    const pihakPertama = {
      nama: item.bacPihakPertamaName ?? baData?.atasan?.nama ?? '-',
      jabatan: item.bacPihakPertamaJabatan ?? baData?.atasan?.jabatan ?? '-',
    };
    const tembusanList: any[] = item.bacTembusan ?? [];

    const arsipList: any[] = baData?.daftarArsip ?? [];
    // BAC memakai format ringkasan resmi "Daftar Berkas".
    // Format item-level "Daftar Isi Berkas" tetap dikirim untuk halaman verifikasi.
    const daftarBerkasRows: any[] =
      daftarIsi?.daftarBerkas ?? daftarIsi?.daftarIsi ?? [];

    const arsipItems = arsipList
      .map((a, i) => `<li>${a.kode ?? '-'} — ${a.perihal ?? '-'}</li>`)
      .join('');

    const daftarBerkasTable = daftarBerkasRows
      .map(
        (r) =>
          `<tr>` +
          `<td style="padding:5px 4px;border:1px solid #444;text-align:center;vertical-align:top;">${r.no}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;vertical-align:top;">${r.kodeKlasifikasi ?? r.kode ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;vertical-align:top;">${r.uraianInformasi ?? r.namaBerkas ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;text-align:center;vertical-align:top;">${r.kurunWaktu ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;text-align:center;vertical-align:top;">${r.jumlahBerkas ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;text-align:center;vertical-align:top;">${r.tingkatPerkembangan ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;vertical-align:top;">${r.lokasiSimpan ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;vertical-align:top;">${r.klasifikasiKeamanan ?? '-'}</td>` +
          `<td style="padding:5px 4px;border:1px solid #444;text-align:center;vertical-align:top;">${r.retensiArsipAktif ?? '-'}</td>` +
          `</tr>`,
      )
      .join('');

    const tembusanHtml =
      tembusanList.length > 0
        ? `<p style="margin:24px 0 4px;"><b>Tembusan:</b></p><ol style="margin:0;padding-left:24px;">${tembusanList
            .map(
              (t) =>
                `<li>${t.name ?? '-'}${t.jabatan ? ` — ${t.jabatan}` : ''}</li>`,
            )
            .join('')}</ol>`
        : '';

    return `
      <div style="font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.6;">
        <p style="text-align:center;font-weight:bold;font-size:14pt;margin:0 0 4px;">BERITA ACARA SERAH TERIMA PEKERJAAN</p>
        <p style="text-align:center;font-size:11pt;margin:0 0 2px;">Pemindahan Arsip Aktif ke Inaktif</p>
        <p style="text-align:center;font-size:11pt;margin:0 0 16px;">Nomor: ${item.beritaAcaraNomor ?? `BA/${item.nomorUsulan}`}</p>

        <p style="margin:0 0 12px;">Pada hari ini ${hari(item.tanggalUsulan)} tanggal ${fmt(item.tanggalUsulan)}, yang bertanda tangan di bawah ini:</p>

        <div style="margin:0 0 12px;">
          <p style="margin:0;"><b>1. Nama&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> ${pihakPertama.nama}</p>
          <p style="margin:0;"><b>&nbsp;&nbsp;&nbsp;Jabatan :</b> ${pihakPertama.jabatan}</p>
          <p style="margin:0;font-style:italic;">Selanjutnya disebut pihak pertama</p>
        </div>
        <div style="margin:0 0 12px;">
          <p style="margin:0;"><b>2. Nama&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> ${baData?.pengirim?.nama ?? '-'}</p>
          <p style="margin:0;"><b>&nbsp;&nbsp;&nbsp;Jabatan :</b> ${baData?.pengirim?.jabatan ?? '-'}</p>
          <p style="margin:0;font-style:italic;">Selanjutnya disebut pihak kedua</p>
        </div>

        <p style="margin:0 0 8px;">Dengan ini menerangkan bahwa:</p>
        <p style="margin:0 0 8px;">Pihak pertama telah menyerahkan kepada pihak kedua berupa:</p>
        <ol style="margin:0 0 12px;padding-left:24px;">${arsipItems}</ol>

        <section style="page-break-before:always;">
        <p style="text-align:center;font-weight:bold;font-size:16pt;margin:0 0 12px;">Daftar Berkas</p>
        <p style="text-align:center;font-size:13pt;margin:0 0 28px;">Unit Kerja: ${baData?.pengirim?.divisi ?? item.divisiName ?? '.........'}</p>
        <table style="width:100%;border-collapse:collapse;font-size:8pt;margin:0 0 16px;table-layout:fixed;">
          <colgroup>
            <col style="width:5%;" />
            <col style="width:10%;" />
            <col style="width:25%;" />
            <col style="width:10%;" />
            <col style="width:8%;" />
            <col style="width:10%;" />
            <col style="width:12%;" />
            <col style="width:10%;" />
            <col style="width:10%;" />
          </colgroup>
          <thead>
            <tr>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">No<br/>Berkas</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Kode<br/>Klasifikasi</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Uraian Informasi Berkas</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Kurun<br/>Waktu</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Jumlah<br/>Berkas</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Tingkat<br/>Perkembangan</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Lokasi<br/>Simpan</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Klasifikasi<br/>Keamanan</th>
              <th style="padding:6px 3px;border:1px solid #444;background:#eee;">Retensi<br/>Arsip Aktif</th>
            </tr>
            <tr>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(1)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(2)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(3)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(4)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(5)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(6)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(7)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(8)</th>
              <th style="padding:5px 3px;border:1px solid #444;font-weight:normal;">(9)</th>
            </tr>
          </thead>
          <tbody>
            ${daftarBerkasTable}
          </tbody>
        </table>
        </section>

        <p style="margin:0 0 24px;">Demikian Berita Acara serah terima ini dibuat rangkap 2 untuk dapat digunakan sebagaimana mestinya.</p>

        <table style="width:100%;border:0;margin:0 0 24px;">
          <tr>
            <td style="width:50%;text-align:center;vertical-align:top;">
              <p style="margin:0 0 64px;"><b>Pihak Pertama</b></p>
              <p style="margin:0;border-top:1px solid #444;padding-top:4px;font-weight:bold;">${pihakPertama.nama}</p>
              <p style="margin:0;font-size:10pt;">${pihakPertama.jabatan}</p>
            </td>
            <td style="width:50%;text-align:center;vertical-align:top;">
              <p style="margin:0 0 64px;"><b>Pihak Kedua</b></p>
              <p style="margin:0;border-top:1px solid #444;padding-top:4px;font-weight:bold;">${baData?.pengirim?.nama ?? '-'}</p>
              <p style="margin:0;font-size:10pt;">${baData?.pengirim?.jabatan ?? '-'}</p>
            </td>
          </tr>
        </table>

        ${tembusanHtml}
      </div>
    `;
  }

  /** Merge BAC PDF dengan PDF final naskah dalam berkas (pdf-lib). */
  private async mergeBacWithNaskah(
    bacBuffer: Buffer,
    item: TransferActiveToInactiveEntity,
  ): Promise<Buffer> {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(bacBuffer);

      const arsipIds = item.arsipIds ?? [
        {
          id: item.arsipId,
          perihal: item.arsipPerihal,
          kode: item.arsipKode,
          tanggalRetensiHabis: null,
        },
      ];

      for (const a of arsipIds) {
        // Ambil naskah dalam berkas
        const naskahRows: any[] = await this.berkasRepo.manager
          .createQueryBuilder()
          .select('bn.naskah_id', 'naskahId')
          .from('berkas_naskah', 'bn')
          .where('bn.berkas_id = :bid', { bid: a.id })
          .orderBy('bn.urutan', 'ASC')
          .getRawMany();

        for (const n of naskahRows) {
          try {
            // Ambil final_pdf key dari tabel naskah
            const rows: any[] = await this.berkasRepo.manager.query(
              `SELECT final_pdf FROM naskah WHERE id = ? LIMIT 1`,
              [n.naskahId],
            );
            const key = rows?.[0]?.final_pdf;
            if (!key) continue;

            const fileBuffer = await this.storageService.getFile(key);
            const naskahPdf = await PDFDocument.load(fileBuffer);
            const pages = await pdfDoc.copyPages(
              naskahPdf,
              naskahPdf.getPageIndices(),
            );
            pages.forEach((p) => pdfDoc.addPage(p));
          } catch {
            // Skip naskah yang PDF-nya tidak tersedia
          }
        }
      }

      const merged = await pdfDoc.save();
      return Buffer.from(merged);
    } catch (e) {
      this.logger.warn(`mergeBacWithNaskah gagal, pakai BAC saja: ${e}`);
      return bacBuffer;
    }
  }

  async generateBeritaAcara(
    id: string,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    const allowed = [
      TransferActiveToInactiveStatus.DISETUJUI_ATASAN,
      TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR,
      TransferActiveToInactiveStatus.DIKIRIM,
      TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
      TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
      TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
      TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
      TransferActiveToInactiveStatus.SELESAI,
    ];
    if (!allowed.includes(item.status)) {
      throw new BadRequestException(
        'Berita acara hanya bisa di-generate setelah persetujuan',
      );
    }
    item.beritaAcaraNomor = `BA/${item.nomorUsulan}`;
    item.beritaAcaraUrl = `/transfer-active-to-inactive/${id}/berita-acara.pdf`;
    const saved = await this.repo.save(item);
    this.auditTrailService.createAsync({
      action: AuditAction.GENERATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'berita_acara',
      entityId: id,
      description: `Generate berita acara ${item.beritaAcaraNomor}`,
      newValue: { beritaAcaraNomor: item.beritaAcaraNomor },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
    });
    return saved;
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────

  async getSummary(user: any) {
    const qb = this.repo.createQueryBuilder('t');
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (roleName === 'USER') {
      qb.andWhere('t.sekretaris_persnum = :p', { p: Number(user.persnum) });
    } else if (roleName === 'ADMIN') {
      qb.andWhere('(t.atasan_persnum = :p OR t.sekretaris_persnum = :p)', {
        p: Number(user.persnum),
      });
    }

    const total = await qb.getCount();
    const menungguVerifikasi = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN,
      })
      .getCount();
    const disetujui = await qb
      .clone()
      .andWhere('t.status IN (:...ss)', {
        ss: [
          TransferActiveToInactiveStatus.DISETUJUI_ATASAN,
          TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR,
        ],
      })
      .getCount();
    const dikirim = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.DIKIRIM,
      })
      .getCount();
    const selesai = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.SELESAI,
      })
      .getCount();
    const menungguFinal = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_TERAKHIR,
      })
      .getCount();
    const menungguBerkas = await qb
      .clone()
      .andWhere('t.status IN (:...ss)', {
        ss: [
          TransferActiveToInactiveStatus.DIKIRIM,
          TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
        ],
      })
      .getCount();
    const berkasSesuai = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
      })
      .getCount();
    const diterima = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
      })
      .getCount();
    const menungguTU = await qb
      .clone()
      .andWhere('t.status IN (:...ss)', {
        ss: [
          TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
          TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
        ],
      })
      .getCount();
    const menungguFinalTU = await qb
      .clone()
      .andWhere('t.status IN (:...ss)', {
        ss: [
          TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
          TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU,
        ],
      })
      .getCount();
    const disetujuiTU = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
      })
      .getCount();

    return {
      total,
      menungguVerifikasi,
      disetujui,
      dikirim,
      selesai,
      menungguFinal,
      menungguBerkas,
      berkasSesuai,
      diterima,
      menungguTU,
      menungguFinalTU,
      disetujuiTU,
    };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────

  /** Pastikan aksi tahap lanjutan dilakukan oleh verifikator terakhir. */
  private async assertFinalVerifier(
    item: TransferActiveToInactiveEntity,
    user: any,
  ): Promise<void> {
    const levels = await this.getApprovalLevels(item.id);
    const finalLevel = levels.length > 0 ? levels[levels.length - 1] : null;
    const finalVerifierPersnum =
      finalLevel?.atasanPersnum ?? item.atasanPersnum;
    if (finalVerifierPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Hanya verifikator terakhir yang dapat meneruskan alur usulan',
      );
    }
  }

  /** Pastikan persetujuan terakhir dilakukan oleh verifikator TU terakhir. */
  private assertFinalTuVerifier(
    item: TransferActiveToInactiveEntity,
    user: any,
  ): void {
    const levels = item.tuApprovalLevels;
    if (Array.isArray(levels) && levels.length > 0) {
      const finalLevel = levels.reduce((latest, level) =>
        level.urutan > latest.urutan ? level : latest,
      );
      if (Number(finalLevel.persnum) !== Number(user.persnum)) {
        throw new BadRequestException(
          'Hanya verifikator TU terakhir yang dapat melakukan persetujuan terakhir',
        );
      }
      return;
    }

    if (
      item.atasanTuPersnum != null &&
      Number(item.atasanTuPersnum) !== Number(user.persnum)
    ) {
      throw new BadRequestException(
        'Hanya verifikator TU terakhir yang dapat melakukan persetujuan terakhir',
      );
    }
  }

  private async getItem(id: string): Promise<TransferActiveToInactiveEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Usulan tidak ditemukan');
    return item;
  }

  /** Ambil level approval berdasarkan urutan (1-based). */
  private async getLevel(
    transferId: string,
    urutan: number,
  ): Promise<TransferApprovalLevelEntity | null> {
    return this.levelRepo.findOne({
      where: { transferId, urutan },
    });
  }

  /** Ambil semua level approval untuk transfer (urut by urutan). */
  async getApprovalLevels(
    transferId: string,
  ): Promise<TransferApprovalLevelEntity[]> {
    return this.levelRepo.find({
      where: { transferId },
      order: { urutan: 'ASC' },
    });
  }

  /** Daftar file dari arsip yang dipilih dalam usulan. */
  async getFiles(transferId: string) {
    const item = await this.getItem(transferId);
    const arsipIds = item.arsipIds ?? [
      {
        id: item.arsipId,
        perihal: item.arsipPerihal,
        kode: item.arsipKode,
        tanggalRetensiHabis: null,
      },
    ];
    const result: any[] = [];
    for (const a of arsipIds) {
      // Ambil naskah dari berkas
      const naskah = await this.berkasRepo.manager
        .createQueryBuilder()
        .select([
          'bn.naskah_id AS naskahId',
          'bn.perihal AS perihal',
          'bn.nomor_surat AS nomorSurat',
        ])
        .from('berkas_naskah', 'bn')
        .where('bn.berkas_id = :bid', { bid: a.id })
        .orderBy('bn.urutan', 'ASC')
        .getRawMany();
      if (naskah.length === 0) {
        result.push({ arsipId: a.id, arsipPerihal: a.perihal, files: [] });
      } else {
        result.push({
          arsipId: a.id,
          arsipPerihal: a.perihal,
          files: naskah.map((n: any) => ({
            naskahId: n.naskahId,
            nama: n.perihal ?? n.nomorSurat ?? n.naskahId,
            url: null,
          })),
        });
      }
    }
    return result;
  }

  /** Daftar isi otomatis dari arsip yang dipilih. */
  async getDaftarIsi(transferId: string) {
    const item = await this.getItem(transferId);
    const arsipIds = item.arsipIds ?? [
      {
        id: item.arsipId,
        perihal: item.arsipPerihal,
        kode: item.arsipKode,
        tanggalRetensiHabis: null,
      },
    ];

    const ids = arsipIds.map((a) => a.id).filter(Boolean);
    if (ids.length === 0) {
      return {
        nomorUsulan: item.nomorUsulan,
        tanggalUsulan: item.tanggalUsulan,
        daftarIsi: [],
        daftarBerkas: [],
      };
    }

    // Metadata berkas dipakai bersama oleh dua format daftar:
    // - Daftar Berkas: satu baris untuk setiap berkas.
    // - Daftar Isi Berkas: satu baris untuk setiap item/naskah dalam berkas.
    const berkasList = await this.berkasRepo
      .createQueryBuilder('b')
      .select([
        'b.id',
        'b.kodeBerkas',
        'b.klasifikasi',
        'b.judulBerkas',
        'b.isiRingkas',
        'b.lokasi',
        'b.retensiAktifTahun',
        'b.tanggalDibuat',
        'b.tanggalDitutup',
      ])
      .where('b.id IN (:...ids)', { ids })
      .getMany();

    const berkasMap = new Map(berkasList.map((b) => [b.id, b]));

    // Satu baris Daftar Berkas mewakili satu berkas; jumlahnya adalah jumlah
    // naskah yang benar-benar terhubung ke berkas tersebut.
    const jumlahRows = await this.berkasRepo.manager
      .createQueryBuilder()
      .select('bn.berkas_id', 'id')
      .addSelect('COUNT(*)', 'jumlah')
      .from('berkas_naskah', 'bn')
      .where('bn.berkas_id IN (:...ids)', { ids })
      .groupBy('bn.berkas_id')
      .getRawMany();
    const jumlahMap = new Map(
      jumlahRows.map((row: any) => [String(row.id), Number(row.jumlah)]),
    );

    const naskahRows = await this.berkasRepo.manager
      .createQueryBuilder()
      .select('bn.berkas_id', 'berkasId')
      .addSelect('bn.naskah_id', 'naskahId')
      .addSelect('bn.perihal', 'perihal')
      .addSelect('bn.nomor_surat', 'nomorSurat')
      .addSelect('bn.tanggal_naskah', 'tanggalNaskah')
      .addSelect('bn.urutan', 'urutan')
      .from('berkas_naskah', 'bn')
      .where('bn.berkas_id IN (:...ids)', { ids })
      .orderBy('bn.berkas_id', 'ASC')
      .addOrderBy('bn.urutan', 'ASC')
      .getRawMany();
    const naskahMap = new Map<string, any[]>();
    for (const row of naskahRows) {
      const key = String(row.berkasId);
      const rows = naskahMap.get(key) ?? [];
      rows.push(row);
      naskahMap.set(key, rows);
    }

    // Keamanan disimpan di master klasifikasi, sedangkan berkas menyimpan
    // kode klasifikasinya.
    const klasifikasiCodes = berkasList
      .map((b) => b.klasifikasi)
      .filter(Boolean);
    const keamananRows =
      klasifikasiCodes.length > 0
        ? await this.berkasRepo.manager
            .createQueryBuilder()
            .select('k.klasifikasi', 'kode')
            .addSelect('k.keamanan', 'keamanan')
            .from('klasifikasi', 'k')
            .where('k.klasifikasi IN (:...codes)', {
              codes: klasifikasiCodes,
            })
            .getRawMany()
        : [];
    const keamananMap = new Map(
      keamananRows.map((row: any) => [String(row.kode), row.keamanan]),
    );

    const year = (value: unknown): string | null => {
      if (!value) return null;
      const match = String(value).match(/\d{4}/);
      return match?.[0] ?? null;
    };

    const daftarBerkas = arsipIds.map((a, idx) => {
      const berkas = berkasMap.get(a.id);
      const years = [year(berkas?.tanggalDibuat), year(berkas?.tanggalDitutup)]
        .filter((v, i, values) => v && values.indexOf(v) === i);

      return {
        no: idx + 1,
        id: a.id,
        namaBerkas: a.perihal,
        kode: berkas?.kodeBerkas ?? a.kode,
        keterangan: a.tanggalRetensiHabis
          ? `Retensi habis: ${a.tanggalRetensiHabis}`
          : '-',
        kodeKlasifikasi: berkas?.klasifikasi ?? '-',
        uraianInformasi: berkas?.isiRingkas ?? berkas?.judulBerkas ?? a.perihal ?? '-',
        kurunWaktu: years.join(' - ') || '-',
        jumlahBerkas: jumlahMap.get(String(a.id)) ?? 0,
        tingkatPerkembangan: '-',
        lokasiSimpan: berkas?.lokasi ?? '-',
        klasifikasiKeamanan: keamananMap.get(String(berkas?.klasifikasi ?? '')) ?? '-',
        retensiArsipAktif:
          berkas?.retensiAktifTahun != null
            ? `${berkas.retensiAktifTahun} tahun`
            : '-',
      };
    });

    const daftarIsi: any[] = [];
    for (const [berkasIndex, a] of arsipIds.entries()) {
      const berkas = berkasMap.get(a.id);
      const summary = daftarBerkas[berkasIndex];
      const rows = naskahMap.get(String(a.id)) ?? [];

      // Berkas tetap tampil meskipun belum memiliki relasi naskah.
      const itemRows = rows.length > 0 ? rows : [null];
      itemRows.forEach((naskah: any, itemIndex: number) => {
        daftarIsi.push({
          no: daftarIsi.length + 1,
          id: a.id,
          naskahId: naskah?.naskahId ?? null,
          namaBerkas: a.perihal,
          kode: summary.kode,
          keterangan: summary.keterangan,
          nomorItem: itemIndex + 1,
          tanggal: naskah?.tanggalNaskah ?? berkas?.tanggalDibuat ?? null,
          kodeKlasifikasi: summary.kodeKlasifikasi,
          uraianInformasi:
            naskah?.perihal ?? naskah?.nomorSurat ?? summary.uraianInformasi ?? '-',
          jumlah: 1,
          jumlahBerkas: 1,
          tingkatPerkembangan: '-',
          lokasiSimpan: summary.lokasiSimpan,
          klasifikasiKeamanan: summary.klasifikasiKeamanan,
        });
      });
    }

    return {
      nomorUsulan: item.nomorUsulan,
      tanggalUsulan: item.tanggalUsulan,
      daftarIsi,
      daftarBerkas,
    };
  }

  /** Data Berita Acara Serah Terima (auto-generate). */
  async getBeritaAcaraData(transferId: string) {
    const item = await this.getItem(transferId);
    const levels = await this.getApprovalLevels(transferId);
    // Berita acara dibuat setelah seluruh atasan menyetujui usulan. Pihak
    // pertama harus verifikator terakhir, bukan atasan pada level pertama.
    const finalAtasan = levels[levels.length - 1] ?? null;
    return {
      nomorUsulan: item.nomorUsulan,
      tanggalUsulan: item.tanggalUsulan,
      keterangan: item.keterangan,
      atasan: {
        nama: finalAtasan?.atasanName ?? item.atasanName,
        jabatan: finalAtasan?.atasanPositionText ?? null,
        persnum: finalAtasan?.atasanPersnum ?? item.atasanPersnum,
        divisi: item.divisiName,
      },
      pengirim: {
        nama: item.sekretarisName,
        jabatan: null,
        persnum: item.sekretarisPersnum,
        divisi: item.divisiName,
      },
      daftarArsip: item.arsipIds ?? [
        {
          id: item.arsipId,
          perihal: item.arsipPerihal,
          kode: item.arsipKode,
          tanggalRetensiHabis: null,
        },
      ],
    };
  }

  /**
   * Cek apakah user login sedang giliran verifikasi pada usulan ini.
   */
  async isCurrentTurn(
    transferId: string,
    userPersnum: number,
  ): Promise<boolean> {
    const item = await this.repo.findOne({ where: { id: transferId } });
    if (!item) return false;
    if (
      item.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN &&
      item.status !== TransferActiveToInactiveStatus.DISETUJUI_ATASAN
    ) {
      return false;
    }
    const level = await this.getLevel(transferId, item.currentApprovalLevel);
    return level?.atasanPersnum === Number(userPersnum);
  }

  /**
   * Cek integritas: Atasan tidak boleh memverifikasi usulan yang dia sendiri buat sebagai Sekretaris.
   * Mencegah konflik interest untuk user dengan role ganda (Sekretaris + Atasan Managerial).
   */
  private checkIntegrity(
    item: TransferActiveToInactiveEntity,
    user: any,
  ): void {
    if (
      item.sekretarisPersnum === Number(user.persnum) &&
      item.atasanPersnum === Number(user.persnum)
    ) {
      throw new BadRequestException(
        'Atasan tidak boleh memverifikasi usulan yang dibuat sendiri sebagai Sekretaris',
      );
    }
  }

  private async generateNomorUsulan(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.repo
      .createQueryBuilder('t')
      .select('t.nomorUsulan') // select eksplisit (nama properti) + hindari kolom entity yang belum ada di DB
      .where('t.nomor_usulan LIKE :p', { p: `UPAI/%/${year}` })
      .orderBy('t.nomor_usulan', 'DESC')
      .getOne();
    let seq = 1;
    if (last?.nomorUsulan) {
      const m = last.nomorUsulan.match(/UPAI\/(\d+)\/\d+/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `UPAI/${String(seq).padStart(3, '0')}/${year}`;
  }

  private logAudit(
    user: any,
    item: TransferActiveToInactiveEntity,
    oldStatus: TransferActiveToInactiveStatus | null,
    newStatus: TransferActiveToInactiveStatus,
    desc: string,
  ) {
    this.auditTrailService.createAsync({
      action: AuditAction.UPDATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'transfer_active_to_inactive',
      entityId: item.id,
      description: `${desc} — ${item.nomorUsulan}: ${oldStatus ?? 'null'} → ${newStatus}`,
      oldValue: oldStatus ? { status: oldStatus } : null,
      newValue: { status: newStatus },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
      userRole: user.activeRole?.name ?? user.role,
    });
  }

  private async notify(
    item: TransferActiveToInactiveEntity,
    positionId: string | null,
    persnum: number | null,
    title: string,
    action = 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
  ) {
    try {
      await this.notificationService.createNotification({
        positionId: positionId ?? '0',
        userPersnum: persnum ?? undefined,
        type: NotificationType.SYSTEM,
        title,
        body: `Usulan ${item.nomorUsulan} — ${item.arsipPerihal}`,
        data: {
          action,
          id: item.id,
          nomorUsulan: item.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notify failed: ${err?.message ?? err}`);
    }
  }
}
