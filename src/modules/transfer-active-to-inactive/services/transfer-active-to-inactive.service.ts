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
import { CreateTransferDto, AtasanItemDto, ArsipItemDto } from '../dto/transfer.dto';
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
    private readonly auditTrailService: AuditTrailService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────────────────────

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

    const entity = this.repo.create({
      nomorUsulan,
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
        // User adalah atasan managerial: tampilkan usulan yang ditujukan ke dia
        // (di salah satu level approval)
        const transferIds = await this.levelRepo
          .createQueryBuilder('l')
          .select('l.transfer_id', 'transferId')
          .where('l.atasan_persnum = :p', { p: Number(user.persnum) })
          .getRawMany();
        const ids = transferIds.map((r) => r.transferId);
        if (ids.length > 0) {
          qb.andWhere('t.id IN (:...ids)', { ids });
        } else {
          // Tidak punya usulan sebagai atasan → hanya lihat miliknya sebagai sekretaris
          qb.andWhere('t.sekretaris_persnum = :p', { p: Number(user.persnum) });
        }
      } else {
        // User adalah Sekretaris biasa: hanya lihat usulan miliknya
        qb.andWhere('t.sekretaris_persnum = :p', { p: Number(user.persnum) });
      }
    } else if (roleName === 'ADMIN' || roleName === 'SUPERADMIN') {
      // Atasan Managerial & Superadmin: lihat usulan yang ditujukan ke dia
      const transferIds = await this.levelRepo
        .createQueryBuilder('l')
        .select('l.transfer_id', 'transferId')
        .where('l.atasan_persnum = :p', { p: Number(user.persnum) })
        .getRawMany();
      const ids = transferIds.map((r) => r.transferId);
      if (ids.length > 0) {
        // Untuk SUPERADMIN, tampilkan juga semua usulan (opsional)
        if (roleName === 'SUPERADMIN') {
          // Superadmin lihat semua
        } else {
          qb.andWhere('t.id IN (:...ids)', { ids });
        }
      } else if (roleName === 'ADMIN') {
        // Admin tanpa usulan → kosong
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

    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (roleName === 'USER') {
      // User bisa akses jika dia adalah sekretaris pengusul ATAU atasan managerial dari usulan ini
      const isSekretaris = item.sekretarisPersnum === Number(user.persnum);
      const isAtasan = levels.some(
        (l) => l.atasanPersnum === Number(user.persnum),
      );
      if (!isSekretaris && !isAtasan) {
        throw new BadRequestException('Anda tidak memiliki akses ke usulan ini');
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
    if (
      item.status !== TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa disetujui`,
      );
    }

    // Cek giliran atasan
    const currentLevel = await this.getLevel(item.id, item.currentApprovalLevel);
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

    // Update level saat ini → DISETUJUI
    currentLevel.status = LEVEL_DISETUJUI;
    currentLevel.verifiedAt = new Date();
    currentLevel.catatan = dto.verifyNote ?? null;
    await this.levelRepo.save(currentLevel);

    const nextLevel = await this.getLevel(item.id, item.currentApprovalLevel + 1);

    if (nextLevel) {
      // Masih ada atasan berikutnya → tetap MENUNGGU_VERIFIKASI_ATASAN, giliran next
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
      // Atasan terakhir → DISETUJUI_VERIFIKASI_TERAKHIR (final)
      item.status = TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR;
      item.finalVerifiedBy = Number(user.persnum);
      item.finalVerifiedAt = new Date();
      item.finalVerifyNote = dto.verifyNote ?? null;
      const saved = await this.repo.save(item);
      this.logAudit(
        user,
        saved,
        old,
        saved.status,
        `Persetujuan final (level ${currentLevel.urutan}) oleh ${currentLevel.atasanName}`,
      );
      await this.notify(
        saved,
        null,
        saved.sekretarisPersnum,
        'Usulan telah diverifikasi terakhir — siap dikirim ke Unit Tata Naskah',
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
      item.status !== TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN
    ) {
      throw new BadRequestException(`Status ${item.status} tidak bisa ditolak`);
    }

    // Cek giliran atasan
    const currentLevel = await this.getLevel(item.id, item.currentApprovalLevel);
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

    // Update level saat ini → DITOLAK
    currentLevel.status = LEVEL_DITOLAK;
    currentLevel.verifiedAt = new Date();
    currentLevel.catatan = dto.rejectedNote;
    await this.levelRepo.save(currentLevel);

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
   * Verifikasi terakhir — DEPRECATED untuk multi-level flow.
   * Pada multi-level, verifikasi final otomatis di-handle oleh approve() saat atasan terakhir.
   * Method ini dipertahankan untuk kompatibilitas, tapi akan menolak jika dipanggil.
   */
  async finalVerify(
    id: string,
    dto: FinalVerifyTransferDto,
    user: any,
  ): Promise<TransferActiveToInactiveEntity> {
    throw new BadRequestException(
      'Verifikasi terakhir tidak diperlukan untuk alur multi-level. Gunakan endpoint approve.',
    );
  }

  async dispatch(id: string, user: any): Promise<TransferActiveToInactiveEntity> {
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
  async kirimUsulPindah(id: string, user: any): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.DISETUJUI_VERIFIKASI_TERAKHIR) {
      throw new BadRequestException(`Status ${item.status} tidak bisa dikirim usul pindah`);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.USUL_PINDAH_DIKIRIM;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Kirim usul pindah arsip inaktif');
    await this.notify(saved, null, saved.sekretarisPersnum, 'Usulan siap dikirim ke Unit Tata Naskah');
    return saved;
  }

  /** Sekretaris klik "Siapkan Berkas Fisik" → SIAPKAN_BERKAS_FISIK */
  async siapkanBerkasFisik(id: string, user: any): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.USUL_PINDAH_DIKIRIM) {
      throw new BadRequestException(`Status ${item.status} tidak bisa siapkan berkas fisik`);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Siapkan berkas fisik');
    return saved;
  }

  /** Sekretaris klik "Selesai" → SELESAI */
  async selesaikanUsulan(id: string, user: any): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferActiveToInactiveStatus.SIAPKAN_BERKAS_FISIK) {
      throw new BadRequestException(`Status ${item.status} tidak bisa diselesaikan`);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.SELESAI;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Usulan selesai');
    await this.notify(saved, null, saved.sekretarisPersnum, 'Usulan pemindahan arsip selesai');
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
      throw new BadRequestException(`Status ${item.status} tidak bisa upload berkas`);
    }
    if (dto.berkasFisikUrl) {
      item.beritaAcaraUrl = dto.berkasFisikUrl;
    }
    if (dto.beritaAcaraSerahTerimaUrl) {
      item.beritaAcaraUrl = dto.beritaAcaraSerahTerimaUrl;
    }
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, item.status, saved.status, 'Upload berkas fisik & berita acara');
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
      item.status =
        TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI;
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
      item.status !==
        TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
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
      item.status !==
        TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
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
    if (
      item.status !== TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA
    ) {
      throw new BadRequestException(`Status ${item.status} tidak bisa ditata`);
    }
    const old = item.status;
    item.status = TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF;
    item.arrangedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Penataan arsip inaktif');
    return saved;
  }

  async complete(id: string, user: any): Promise<TransferActiveToInactiveEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF
    ) {
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

  private async getItem(
    id: string,
  ): Promise<TransferActiveToInactiveEntity> {
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

  /**
   * Cek apakah user login sedang giliran verifikasi pada usulan ini.
   */
  async isCurrentTurn(transferId: string, userPersnum: number): Promise<boolean> {
    const item = await this.repo.findOne({ where: { id: transferId } });
    if (!item) return false;
    if (item.status !== TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_ATASAN) {
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