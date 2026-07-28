import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferInactiveFileEntity } from '../entities/transfer-inactive-file.entity';
import { TransferInactiveFileStatus } from '../enums/transfer-status.enum';
import { CreateTransferDto } from '../dto/transfer.dto';
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

/**
 * Service untuk pemindahan arsip inaktif.
 * 2 Unit: Unit Kerja (Sekretaris + Atasan) → Unit Tata Naskah (TU + Atasan TU).
 */
@Injectable()
export class TransferInactiveFileService {
  private readonly logger = new Logger(TransferInactiveFileService.name);

  constructor(
    @InjectRepository(TransferInactiveFileEntity)
    private readonly repo: Repository<TransferInactiveFileEntity>,
    private readonly auditTrailService: AuditTrailService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────────────────────

  async create(
    dto: CreateTransferDto,
    user: any,
  ): Promise<TransferInactiveFileEntity> {
    const nomorUsulan = await this.generateNomorUsulan();
    const status = dto.submit
      ? TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_ATASAN
      : TransferInactiveFileStatus.DRAFT;

    const entity = this.repo.create({
      nomorUsulan,
      tanggalUsulan: dto.tanggalUsulan
        ? new Date(dto.tanggalUsulan)
        : new Date(),
      sekretarisPersnum: Number(user.persnum),
      sekretarisName: user.nama ?? String(user.persnum),
      divisiId: user.organization ? Number(user.organization) : null,
      divisiName: user.organizationText ?? null,
      atasanPersnum: dto.atasanPersnum,
      atasanName: dto.atasanName ?? String(dto.atasanPersnum),
      atasanPositionId: dto.atasanPositionId ?? null,
      arsipId: dto.arsipId,
      arsipPerihal: dto.arsipPerihal ?? '-',
      arsipKode: dto.arsipKode ?? null,
      tanggalRetensiAktifHabis: dto.tanggalRetensiAktifHabis
        ? new Date(dto.tanggalRetensiAktifHabis)
        : null,
      keterangan: dto.keterangan ?? null,
      status,
    });

    const saved = await this.repo.save(entity);
    this.logAudit(
      user,
      saved,
      null,
      saved.status,
      'Membuat usulan pemindahan arsip inaktif',
    );

    if (dto.submit) {
      await this.notify(
        saved,
        saved.atasanPositionId != null ? String(saved.atasanPositionId) : null,
        saved.atasanPersnum,
        'Verifikasi Usulan Pemindahan Arsip Inaktif',
      );
    }
    return saved;
  }

  // ─── READ ─────────────────────────────────────────────────────────────

  async findAll(filter: TransferFilterDto, user: any) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('t');
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();

    // Role-based filter
    if (roleName === 'USER') {
      // Sekretaris: hanya lihat usulan miliknya
      qb.andWhere('t.sekretaris_persnum = :p', { p: Number(user.persnum) });
    } else if (roleName === 'ADMIN') {
      // Atasan Managerial: hanya lihat usulan yang ditujukan ke dia sebagai atasan
      qb.andWhere('t.atasan_persnum = :p', { p: Number(user.persnum) });
    }
    // SUPERADMIN: lihat semua

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

  async findOne(id: string, user: any): Promise<TransferInactiveFileEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item)
      throw new NotFoundException(
        'Usulan pemindahan arsip inaktif tidak ditemukan',
      );

    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (
      roleName === 'USER' &&
      item.sekretarisPersnum !== Number(user.persnum)
    ) {
      throw new BadRequestException('Anda tidak memiliki akses ke usulan ini');
    }
    return item;
  }

  // ─── UNIT KERJA WORKFLOW ─────────────────────────────────────────────

  async send(id: string, user: any): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.DRAFT &&
      item.status !== TransferInactiveFileStatus.DITOLAK_ATASAN
    ) {
      throw new BadRequestException(`Status ${item.status} tidak bisa dikirim`);
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_ATASAN;
    item.rejectedNote = null;
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Kirim usulan ke atasan');
    await this.notify(
      saved,
      saved.atasanPositionId != null ? String(saved.atasanPositionId) : null,
      saved.atasanPersnum,
      'Verifikasi Usulan Pemindahan Arsip Inaktif',
    );
    return saved;
  }

  async approve(
    id: string,
    dto: ApproveTransferDto,
    user: any,
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    this.checkIntegrity(item, user);
    if (item.status !== TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_ATASAN) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa disetujui`,
      );
    }
    const old = item.status;
    item.verifyNote = dto.verifyNote ?? null;
    item.approvedBy = Number(user.persnum);
    item.approvedAt = new Date();
    // Flowchart: DISETUJUI_ATASAN → MENUNGGU_VERIFIKASI_TERAKHIR (otomatis)
    // Atasan managerial langsung melakukan verifikasi terakhir setelah approve.
    item.status = TransferInactiveFileStatus.DISETUJUI_ATASAN;
    const approved = await this.repo.save(item);
    this.logAudit(
      user,
      approved,
      old,
      approved.status,
      'Persetujuan usulan oleh atasan',
    );
    // Notifikasi ke Sekretaris: usulan disetujui, menunggu verifikasi terakhir
    await this.notify(
      approved,
      null,
      approved.sekretarisPersnum,
      'Usulan disetujui atasan, menunggu verifikasi terakhir',
    );
    // Auto-transition ke MENUNGGU_VERIFIKASI_TERAKHIR & notifikasi ke Atasan Managerial
    approved.status = TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_TERAKHIR;
    const saved = await this.repo.save(approved);
    this.logAudit(
      user,
      saved,
      TransferInactiveFileStatus.DISETUJUI_ATASAN,
      saved.status,
      'Otomatis: menunggu verifikasi terakhir atasan',
    );
    await this.notify(
      saved,
      saved.atasanPositionId != null ? String(saved.atasanPositionId) : null,
      saved.atasanPersnum,
      'Verifikasi terakhir usulan pemindahan arsip inaktif',
    );
    return saved;
  }

  async reject(
    id: string,
    dto: RejectTransferDto,
    user: any,
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    this.checkIntegrity(item, user);
    if (
      item.status !== TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_ATASAN &&
      item.status !== TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(`Status ${item.status} tidak bisa ditolak`);
    }
    const old = item.status;
    item.status =
      item.status === TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_TERAKHIR
        ? TransferInactiveFileStatus.DITOLAK_VERIFIKASI_TERAKHIR
        : TransferInactiveFileStatus.DITOLAK_ATASAN;
    item.rejectedNote = dto.rejectedNote;
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Penolakan usulan oleh atasan',
    );
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan pemindahan arsip inaktif ditolak atasan',
    );
    return saved;
  }

  async finalVerify(
    id: string,
    dto: FinalVerifyTransferDto,
    user: any,
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    this.checkIntegrity(item, user);
    if (
      item.status !== TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diverifikasi terakhir`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.DISETUJUI_VERIFIKASI_TERAKHIR;
    item.finalVerifyNote = dto.finalVerifyNote ?? null;
    item.finalVerifiedBy = Number(user.persnum);
    item.finalVerifiedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Verifikasi terakhir unit kerja',
    );
    // Notifikasi ke Sekretaris: verifikasi terakhir selesai, siap dispatch
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Usulan telah diverifikasi terakhir — siap dikirim ke Unit Tata Naskah',
    );
    return saved;
  }

  async dispatch(id: string, user: any): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.DISETUJUI_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa dikirim ke Unit Tata Naskah`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.DIKIRIM;
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

  // ─── UNIT TATA NASKAH WORKFLOW ───────────────────────────────────────

  async verifyPhysicalFiles(
    id: string,
    dto: VerifyPhysicalFilesDto,
    user: any,
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.DIKIRIM &&
      item.status !==
        TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK
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
      item.status = TransferInactiveFileStatus.BERKAS_FISIK_SESUAI;
    } else {
      // Tidak sesuai → kembali ke Unit Kerja (status DIKIRIM, Sekretaris perbaiki)
      item.status = TransferInactiveFileStatus.BERKAS_FISIK_TIDAK_SESUAI;
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
      // Notifikasi ke atasan TU
      await this.notify(
        saved,
        null,
        saved.atasanTuPersnum,
        'Berkas fisik sesuai, perlu persetujuan',
      );
    } else {
      // Notifikasi ke Sekretaris
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
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.BERKAS_FISIK_SESUAI &&
      item.status !==
        TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa disetujui TU`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TU;
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
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.BERKAS_FISIK_SESUAI &&
      item.status !==
        TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa ditolak TU`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.DITOLAK_PERSETUJUAN_TU;
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
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TU &&
      item.status !==
        TransferInactiveFileStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa final approve TU`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU;
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
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !== TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TU &&
      item.status !==
        TransferInactiveFileStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa ditolak final TU`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.DITOLAK_PERSETUJUAN_TERAKHIR_TU;
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
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (
      item.status !==
      TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diterima`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.ARSIP_INAKTIF_DITERIMA;
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
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferInactiveFileStatus.ARSIP_INAKTIF_DITERIMA) {
      throw new BadRequestException(`Status ${item.status} tidak bisa ditata`);
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.PENATAAN_ARSIP_INAKTIF;
    item.arrangedAt = new Date();
    const saved = await this.repo.save(item);
    this.logAudit(user, saved, old, saved.status, 'Penataan arsip inaktif');
    return saved;
  }

  async complete(id: string, user: any): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    if (item.status !== TransferInactiveFileStatus.PENATAAN_ARSIP_INAKTIF) {
      throw new BadRequestException(
        `Status ${item.status} tidak bisa diselesaikan`,
      );
    }
    const old = item.status;
    item.status = TransferInactiveFileStatus.SELESAI;
    const saved = await this.repo.save(item);
    this.logAudit(
      user,
      saved,
      old,
      saved.status,
      'Pemindahan arsip inaktif selesai',
    );
    await this.notify(
      saved,
      null,
      saved.sekretarisPersnum,
      'Pemindahan arsip inaktif selesai',
    );
    return saved;
  }

  // ─── BERITA ACARA ─────────────────────────────────────────────────────

  async generateBeritaAcara(
    id: string,
    user: any,
  ): Promise<TransferInactiveFileEntity> {
    const item = await this.getItem(id);
    const allowed = [
      TransferInactiveFileStatus.DISETUJUI_ATASAN,
      TransferInactiveFileStatus.DISETUJUI_VERIFIKASI_TERAKHIR,
      TransferInactiveFileStatus.DIKIRIM,
      TransferInactiveFileStatus.BERKAS_FISIK_SESUAI,
      TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TU,
      TransferInactiveFileStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
      TransferInactiveFileStatus.ARSIP_INAKTIF_DITERIMA,
      TransferInactiveFileStatus.SELESAI,
    ];
    if (!allowed.includes(item.status)) {
      throw new BadRequestException(
        'Berita acara hanya bisa di-generate setelah persetujuan',
      );
    }
    item.beritaAcaraNomor = `BA/${item.nomorUsulan}`;
    item.beritaAcaraUrl = `/transfer-inactive-file/${id}/berita-acara.pdf`;
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
        s: TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_ATASAN,
      })
      .getCount();
    const disetujui = await qb
      .clone()
      .andWhere('t.status IN (:...ss)', {
        ss: [
          TransferInactiveFileStatus.DISETUJUI_ATASAN,
          TransferInactiveFileStatus.DISETUJUI_VERIFIKASI_TERAKHIR,
        ],
      })
      .getCount();
    const dikirim = await qb
      .clone()
      .andWhere('t.status = :s', { s: TransferInactiveFileStatus.DIKIRIM })
      .getCount();
    const selesai = await qb
      .clone()
      .andWhere('t.status = :s', { s: TransferInactiveFileStatus.SELESAI })
      .getCount();
    const menungguFinal = await qb
      .clone()
      .andWhere('t.status = :s', {
        s: TransferInactiveFileStatus.MENUNGGU_VERIFIKASI_TERAKHIR,
      })
      .getCount();

    return { total, menungguVerifikasi, disetujui, dikirim, selesai, menungguFinal };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────

  private async getItem(id: string): Promise<TransferInactiveFileEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Usulan tidak ditemukan');
    return item;
  }

  /**
   * Cek integritas: Atasan tidak boleh memverifikasi usulan yang dia sendiri buat sebagai Sekretaris.
   * Mencegah konflik interest untuk user dengan role ganda (Sekretaris + Atasan Managerial).
   */
  private checkIntegrity(
    item: TransferInactiveFileEntity,
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
    item: TransferInactiveFileEntity,
    oldStatus: TransferInactiveFileStatus | null,
    newStatus: TransferInactiveFileStatus,
    desc: string,
  ) {
    this.auditTrailService.createAsync({
      action: AuditAction.UPDATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'transfer_inactive_file',
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
    item: TransferInactiveFileEntity,
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
          action: 'OPEN_TRANSFER_INACTIVE_FILE',
          id: item.id,
          nomorUsulan: item.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notify failed: ${err?.message ?? err}`);
    }
  }
}
