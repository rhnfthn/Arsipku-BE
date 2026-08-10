import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
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

  async create(
    dto: CreateTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
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
    const userId = Number(user.persnum);
    const today = new Date().toISOString().split('T')[0];

    // Evaluasi retensi on-demand: berkas yang retensinya habis langsung
    // tersedia untuk dipindahkan, tanpa menunggu cron 2AM.
    await this.arsipDinamisService.tutupBerkasRetensiHabis();

    // Cek role: ADMIN/SUPERADMIN lihat semua berkas, USER hanya miliknya.
    // Konsisten dengan getGabungan() — tanpa bypass ini, admin/superadmin
    // yang login sebagai sekretaris tidak melihat arsip dummy (persnum ≠
    // 10011066) sehingga dropdown arsip di form usulan pindah kosong.
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    const isPrivileged = roleName === 'ADMIN' || roleName === 'SUPERADMIN';

    // 1. Ambil berkas milik user, status Tertutup, retensi aktif habis
    const berkasQb = this.berkasRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');
    if (!isPrivileged) {
      berkasQb.andWhere(
        '(b.created_by = :userId OR b.pic_persnum = :userPersnum)',
        {
          userId,
          userPersnum: String(userId),
        },
      );
    }
    const berkasList = await berkasQb
      .andWhere('b.status = :status', { status: 'closed_retensi_aktif' })
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
   * Auto-integrasi: berkas yang statusnya closed_retensi_aktif dan belum
   * punya usulan pemindahan apa pun → langsung dibuatkan usulan DRAFT
   * otomatis (atasan masih kosong, diisi user lewat tombol "Kirim").
   * Dipanggil on-demand sebelum tabel gabungan dibaca; idempotent.
   */
  async syncDraftUsulanOtomatis(): Promise<number> {
    const berkasList = await this.berkasRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere('b.status = :status', {
        status: StatusBerkas.CLOSED_RETENSI_AKTIF,
      })
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
    const userId = Number(user.persnum);
    const search = filter?.search?.trim() || '';
    const filterKlasifikasi = filter?.klasifikasi?.trim() || '';
    const filterTahun = filter?.tahun?.trim() || '';

    // Evaluasi retensi on-demand: status berkas di tabel gabungan selalu segar.
    await this.arsipDinamisService.tutupBerkasRetensiHabis();
    // Auto-integrasi: berkas yang retensinya habis langsung jadi usulan DRAFT.
    await this.syncDraftUsulanOtomatis();

    // Cek role: ADMIN/SUPERADMIN lihat semua, USER hanya miliknya
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    const isPrivileged = roleName === 'ADMIN' || roleName === 'SUPERADMIN';

    // 1. Ambil usulan (semua untuk ADMIN/SUPERADMIN, milik sekretaris login untuk USER)
    const usulanQb = this.repo
      .createQueryBuilder('t')
      .orderBy('t.created_at', 'DESC');
    if (!isPrivileged) {
      usulanQb.where('t.sekretaris_persnum = :p', { p: userId });
    }
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

    // 2. Ambil berkas Tertutup yang BELUM masuk usulan apapun
    const berkasQb = this.berkasRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL');
    // USER hanya lihat berkas miliknya, ADMIN/SUPERADMIN lihat semua
    if (!isPrivileged) {
      berkasQb.andWhere(
        '(b.created_by = :userId OR b.pic_persnum = :userPersnum)',
        {
          userId,
          userPersnum: String(userId),
        },
      );
    }
    berkasQb
      .andWhere('b.status = :status', { status: 'closed_retensi_aktif' })
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
        tanggal: b.tanggalRetensiAktifBerakhir,
        lokasiFisik: b.lokasi,
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
        updatedAt: u.updatedAt,
        currentApprovalLevel: u.currentApprovalLevel,
        totalApprovalLevels: u.totalApprovalLevels,
      });
    }

    // Sort: usulan (by updatedAt DESC) dulu, lalu arsip belum usulan (by retensi ASC)
    rows.sort((a, b) => {
      if (a.isUsulan && !b.isUsulan) return -1;
      if (!a.isUsulan && b.isUsulan) return 1;
      if (a.isUsulan) {
        const aTime = new Date((a as any).updatedAt ?? a.tanggal).getTime();
        const bTime = new Date((b as any).updatedAt ?? b.tanggal).getTime();
        return bTime - aTime;
      }
      return new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime();
    });

    return rows;
  }

  async findAll(filter: TransferFilterDto, user: any) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('t');
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();

    // Role-based filter
    if (roleName === 'USER') {
      // Cek apakah user ini pernah dipilih sebagai atasan managerial
      const isAtasan = await this.isAtasanManagerial(user);
      if (isAtasan) {
        // User adalah atasan managerial: tampilkan usulan yang SUDAH giliran dia
        // (currentApprovalLevel = urutan dia di transfer_approval_levels)
        // + usulan miliknya sebagai sekretaris
        const myLevels = await this.levelRepo
          .createQueryBuilder('l')
          .select(['l.transfer_id AS transferId', 'l.urutan AS urutan'])
          .where('l.atasan_persnum = :p', { p: Number(user.persnum) })
          .getRawMany();
        // Filter usulan di mana currentApprovalLevel = urutan dia
        const readyIds = myLevels
          .filter((r) => r.urutan !== null)
          .map((r) => r.transferId);
        if (readyIds.length > 0) {
          // Usulan yang sudah giliran dia (currentApprovalLevel = urutan dia)
          qb.andWhere(
            '(t.id IN (:...readyIds) AND t.current_approval_level IN (:...myUrutans)) OR t.sekretaris_persnum = :p',
            {
              readyIds,
              myUrutans: myLevels.map((r) => r.urutan),
              p: Number(user.persnum),
            },
          );
        } else {
          // Tidak punya usulan sebagai atasan → hanya lihat miliknya sebagai sekretaris
          qb.andWhere('t.sekretaris_persnum = :p', { p: Number(user.persnum) });
        }
      } else {
        // User adalah Sekretaris biasa: hanya lihat usulan miliknya
        qb.andWhere('t.sekretaris_persnum = :p', { p: Number(user.persnum) });
      }
    } else if (roleName === 'ADMIN' || roleName === 'SUPERADMIN') {
      // Atasan Managerial: tampilkan usulan yang SUDAH giliran dia
      // (currentApprovalLevel = urutan dia di transfer_approval_levels)
      const myLevels = await this.levelRepo
        .createQueryBuilder('l')
        .select(['l.transfer_id AS transferId', 'l.urutan AS urutan'])
        .where('l.atasan_persnum = :p', { p: Number(user.persnum) })
        .getRawMany();
      const readyIds = myLevels
        .filter((r) => r.urutan !== null)
        .map((r) => r.transferId);
      if (readyIds.length > 0) {
        qb.andWhere(
          't.id IN (:...readyIds) AND t.current_approval_level IN (:...myUrutans)',
          { readyIds, myUrutans: myLevels.map((r) => r.urutan) },
        );
      } else {
        // Tidak punya usulan sebagai atasan → kosong
        qb.andWhere('1 = 0');
      }
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
      const klasifikasiMap = new Map<string, string>();
      for (const b of berkasList) {
        klasifikasiMap.set(b.id, b.klasifikasiTeks ?? b.klasifikasi ?? null);
      }
      for (const d of data) {
        (d as any).arsipKlasifikasi = klasifikasiMap.get(d.arsipId) ?? null;
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
        .select(['b.id', 'b.klasifikasi', 'b.klasifikasiTeks'])
        .where('b.id = :id', { id: item.arsipId })
        .getOne();
      if (berkas) {
        (item as any).arsipKlasifikasi =
          berkas.klasifikasiTeks ?? berkas.klasifikasi ?? null;
      }
    }

    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (roleName === 'USER') {
      // User bisa akses jika dia adalah sekretaris pengusul ATAU atasan managerial dari usulan ini
      const isSekretaris = item.sekretarisPersnum === Number(user.persnum);
      const isAtasan = levels.some(
        (l) => l.atasanPersnum === Number(user.persnum),
      );
      // Atasan Managerial TU (HERMANA 10010123 / PRIYO 10010970) juga boleh
      // akses detail usulan — mereka verifikasi penerimaan dari TU.
      const isAtasanTu = [10010123, 10010970].includes(Number(user.persnum));
      if (!isSekretaris && !isAtasan && !isAtasanTu) {
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
      // Atasan terakhir → MENUNGGU_VERIFIKASI_TERAKHIR (Menunggu Persetujuan)
      // Atasan perlu verifikasi terakhir (dengan Daftar Isi + BA) sebelum kirim ke TU
      item.status = TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_TERAKHIR;
      // Reset currentApprovalLevel ke 1 — verifikasi final dilakukan oleh atasan level 1
      item.currentApprovalLevel = 1;
      item.approvedBy = Number(user.persnum);
      item.approvedAt = new Date();
      item.verifyNote = dto.verifyNote ?? null;
      const saved = await this.repo.save(item);
      this.logAudit(
        user,
        saved,
        old,
        saved.status,
        `Persetujuan level ${currentLevel.urutan} oleh ${currentLevel.atasanName} — menunggu verifikasi terakhir`,
      );
      // Notifikasi atasan level 1 untuk verifikasi final (Pindah Usulan)
      const firstLevel = await this.getLevel(item.id, 1);
      if (firstLevel) {
        // Update kolom legacy atasan ke atasan level 1
        item.atasanPersnum = firstLevel.atasanPersnum;
        item.atasanName = firstLevel.atasanName;
        item.atasanPositionId = firstLevel.atasanPositionId;
        await this.repo.save(item);
        await this.notify(
          saved,
          firstLevel.atasanPositionId != null
            ? String(firstLevel.atasanPositionId)
            : null,
          firstLevel.atasanPersnum,
          'Verifikasi Terakhir Usulan Pemindahan Arsip Aktif ke Inaktif',
        );
      }
      // Notifikasi sekretaris bahwa semua atasan sudah approve
      await this.notify(
        saved,
        null,
        saved.sekretarisPersnum,
        'Usulan disetujui semua atasan, menunggu verifikasi terakhir oleh atasan pertama',
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
    // Hanya atasan level 1 (urutan=1) yang bisa verifikasi final
    const firstLevel = await this.getLevel(id, 1);
    if (!firstLevel || firstLevel.atasanPersnum !== Number(user.persnum)) {
      throw new BadRequestException(
        'Hanya atasan pertama yang dapat melakukan verifikasi terakhir',
      );
    }
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
    return {
      nomorUsulan: item.nomorUsulan,
      tanggalUsulan: item.tanggalUsulan,
      daftarIsi: arsipIds.map((a, idx) => ({
        no: idx + 1,
        id: a.id,
        namaBerkas: a.perihal,
        kode: a.kode,
        keterangan: a.tanggalRetensiHabis
          ? `Retensi habis: ${a.tanggalRetensiHabis}`
          : '-',
      })),
    };
  }

  /** Data Berita Acara Serah Terima (auto-generate). */
  async getBeritaAcaraData(transferId: string) {
    const item = await this.getItem(transferId);
    const levels = await this.getApprovalLevels(transferId);
    const firstAtasan = levels[0] ?? null;
    return {
      nomorUsulan: item.nomorUsulan,
      tanggalUsulan: item.tanggalUsulan,
      keterangan: item.keterangan,
      atasan: {
        nama: firstAtasan?.atasanName ?? item.atasanName,
        jabatan: firstAtasan?.atasanPositionText ?? null,
        persnum: firstAtasan?.atasanPersnum ?? item.atasanPersnum,
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
  ) {
    try {
      await this.notificationService.createNotification({
        positionId: positionId ?? '0',
        userPersnum: persnum ?? undefined,
        type: NotificationType.SYSTEM,
        title,
        body: `Usulan ${item.nomorUsulan} — ${item.arsipPerihal}`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: item.id,
          nomorUsulan: item.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notify failed: ${err?.message ?? err}`);
    }
  }
}
