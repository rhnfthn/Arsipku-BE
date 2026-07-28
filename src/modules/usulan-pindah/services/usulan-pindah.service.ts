import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsulanPindahArsipInaktifEntity } from '../entities/usulan-pindah.entity';
import { UsulanPindahStatus } from '../enums/usulan-status.enum';
import { CreateUsulanPindahDto } from '../dto/create-usulan.dto';
import {
  VerifyUsulanDto,
  ApproveUsulanDto,
  RejectUsulanDto,
  FinalVerifyUsulanDto,
  PreparePhysicalDto,
} from '../dto/usulan-pindah.dto';
import { UsulanPindahFilterDto } from '../dto/usulan-pindah-filter.dto';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditModule } from '../../audit/enums/audit-module.enum';
import { AuditStatus } from '../../audit/enums/audit-status.enum';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities/notification.entity';

/**
 * Service untuk mengelola usulan pindah arsip inaktif.
 *
 * Flow status mengikuti flowchart:
 *   DRAFT → MENUNGGU_VERIFIKASI_ATASAN → DISETUJUI_ATASAN
 *     → MENUNGGU_VERIFIKASI_TERAKHIR → DISETUJUI_VERIFIKASI_TERAKHIR
 *       → DIKIRIM → BERKAS_FISIK_DIPERSIAPKAN → SELESAI
 *
 * Setiap perubahan status dicatat di audit trail (fire-and-forget).
 */
@Injectable()
export class UsulanPindahService {
  private readonly logger = new Logger(UsulanPindahService.name);

  constructor(
    @InjectRepository(UsulanPindahArsipInaktifEntity)
    private readonly repo: Repository<UsulanPindahArsipInaktifEntity>,
    private readonly auditTrailService: AuditTrailService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────────────────────

  /**
   * Sekretaris membuat usulan pindah arsip inaktif.
   * Jika dto.submit = true, langsung kirim ke atasan.
   */
  async create(
    dto: CreateUsulanPindahDto,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const nomorUsulan = await this.generateNomorUsulan();
    const status = dto.submit
      ? UsulanPindahStatus.MENUNGGU_VERIFIKASI_ATASAN
      : UsulanPindahStatus.DRAFT;

    const entity = this.repo.create({
      nomorUsulan,
      tanggalUsulan: dto.tanggalUsulan
        ? new Date(dto.tanggalUsulan)
        : new Date(),
      sekretarisPersnum: Number(user.persnum),
      sekretarisName: user.nama ?? user.name ?? String(user.persnum),
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

    // Audit trail
    this.auditTrailService.createAsync({
      action: AuditAction.CREATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'usulan_pindah_arsip_inaktif',
      entityId: saved.id,
      description: `Membuat usulan pindah arsip inaktif ${nomorUsulan}`,
      newValue: { ...saved, status },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
      userRole: user.activeRole?.name ?? user.role,
    });

    // Notifikasi ke atasan jika langsung submit
    if (dto.submit) {
      await this.notifyAtasan(saved, 'Verifikasi Usulan Pindah Arsip Inaktif');
    }

    return saved;
  }

  // ─── READ ─────────────────────────────────────────────────────────────

  /**
   * List usulan dengan filter & pagination.
   * Filter otomatis berdasarkan role: sekretaris lihat miliknya, atasan lihat yang ditujukan.
   */
  async findAll(filter: UsulanPindahFilterDto, user: any) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('u');

    // Role-based filter
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (roleName === 'USER') {
      // Sekretaris: hanya lihat usulan miliknya
      qb.andWhere('u.sekretaris_persnum = :persnum', {
        persnum: Number(user.persnum),
      });
    } else if (roleName === 'ADMIN') {
      // Atasan managerial: lihat yang ditujukan ke dia
      qb.andWhere('u.atasan_persnum = :persnum', {
        persnum: Number(user.persnum),
      });
    }
    // SUPERADMIN: lihat semua

    if (filter.status) {
      qb.andWhere('u.status = :status', { status: filter.status });
    }
    if (filter.divisiId) {
      qb.andWhere('u.divisi_id = :divisiId', { divisiId: filter.divisiId });
    }
    if (filter.startDate) {
      qb.andWhere('u.tgl_usulan >= :startDate', {
        startDate: new Date(filter.startDate),
      });
    }
    if (filter.endDate) {
      const end = new Date(`${filter.endDate}T23:59:59`);
      qb.andWhere('u.tgl_usulan <= :endDate', { endDate: end });
    }
    if (filter.search) {
      qb.andWhere(
        '(u.nomor_usulan ILIKE :search OR u.arsip_perihal ILIKE :search OR u.sekretaris_name ILIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const allowedSort = ['createdAt', 'tanggalUsulan', 'status', 'nomorUsulan'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`u.${safeSort}`, sortOrder === 'ASC' ? 'ASC' : 'DESC');

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detail satu usulan. Cek akses berdasarkan role.
   */
  async findOne(
    id: string,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) {
      throw new NotFoundException(
        'Usulan pindah arsip inaktif tidak ditemukan',
      );
    }

    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (
      roleName === 'USER' &&
      usulan.sekretarisPersnum !== Number(user.persnum)
    ) {
      throw new BadRequestException('Anda tidak memiliki akses ke usulan ini');
    }
    if (roleName === 'ADMIN' && usulan.atasanPersnum !== Number(user.persnum)) {
      throw new BadRequestException('Anda tidak memiliki akses ke usulan ini');
    }

    return usulan;
  }

  // ─── WORKFLOW ACTIONS ─────────────────────────────────────────────────

  /**
   * Kirim usulan DRAFT ke atasan untuk verifikasi.
   */
  async send(id: string, user: any): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (
      usulan.status !== UsulanPindahStatus.DRAFT &&
      usulan.status !== UsulanPindahStatus.DITOLAK_ATASAN
    ) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa dikirim`,
      );
    }

    const oldStatus = usulan.status;
    usulan.status = UsulanPindahStatus.MENUNGGU_VERIFIKASI_ATASAN;
    usulan.rejectedNote = null;
    const saved = await this.repo.save(usulan);

    this.logAudit(
      user,
      usulan,
      oldStatus,
      usulan.status,
      'Kirim usulan ke atasan',
    );
    await this.notifyAtasan(saved, 'Verifikasi Usulan Pindah Arsip Inaktif');

    return saved;
  }

  /**
   * Atasan managerial menyetujui usulan.
   */
  async approve(
    id: string,
    dto: ApproveUsulanDto,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (usulan.status !== UsulanPindahStatus.MENUNGGU_VERIFIKASI_ATASAN) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa disetujui`,
      );
    }

    const oldStatus = usulan.status;
    usulan.status = UsulanPindahStatus.DISETUJUI_ATASAN;
    usulan.verifyNote = dto.verifyNote ?? null;
    usulan.approvedBy = Number(user.persnum);
    usulan.approvedAt = new Date();

    // Jika butuh verifikasi terakhir, lanjut ke MENUNGGU_VERIFIKASI_TERAKHIR
    if (dto.needFinalVerification) {
      usulan.status = UsulanPindahStatus.MENUNGGU_VERIFIKASI_TERAKHIR;
    }

    const saved = await this.repo.save(usulan);

    this.logAudit(
      user,
      usulan,
      oldStatus,
      usulan.status,
      'Persetujuan usulan oleh atasan',
    );
    await this.notifySekretaris(saved, 'Usulan Anda telah disetujui atasan');

    return saved;
  }

  /**
   * Atasan managerial menolak usulan.
   */
  async reject(
    id: string,
    dto: RejectUsulanDto,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (
      usulan.status !== UsulanPindahStatus.MENUNGGU_VERIFIKASI_ATASAN &&
      usulan.status !== UsulanPindahStatus.MENUNGGU_VERIFIKASI_TERAKHIR
    ) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa ditolak`,
      );
    }

    const oldStatus = usulan.status;
    if (usulan.status === UsulanPindahStatus.MENUNGGU_VERIFIKASI_TERAKHIR) {
      usulan.status = UsulanPindahStatus.DITOLAK_VERIFIKASI_TERAKHIR;
    } else {
      usulan.status = UsulanPindahStatus.DITOLAK_ATASAN;
    }
    usulan.rejectedNote = dto.rejectedNote;

    const saved = await this.repo.save(usulan);

    this.logAudit(
      user,
      usulan,
      oldStatus,
      usulan.status,
      'Penolakan usulan oleh atasan',
    );
    await this.notifySekretaris(saved, 'Usulan Anda ditolak atasan');

    return saved;
  }

  /**
   * Verifikasi terakhir (EVP Corporate Secretary / atasan managerial).
   */
  async finalVerify(
    id: string,
    dto: FinalVerifyUsulanDto,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (usulan.status !== UsulanPindahStatus.MENUNGGU_VERIFIKASI_TERAKHIR) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa diverifikasi terakhir`,
      );
    }

    const oldStatus = usulan.status;
    usulan.status = UsulanPindahStatus.DISETUJUI_VERIFIKASI_TERAKHIR;
    usulan.finalVerifyNote = dto.finalVerifyNote ?? null;
    usulan.finalVerifiedBy = Number(user.persnum);
    usulan.finalVerifiedAt = new Date();

    const saved = await this.repo.save(usulan);

    this.logAudit(
      user,
      usulan,
      oldStatus,
      usulan.status,
      'Verifikasi terakhir usulan',
    );
    await this.notifySekretaris(
      saved,
      'Usulan Anda telah diverifikasi terakhir',
    );

    return saved;
  }

  /**
   * Kirim usulan yang sudah disetujui verifikasi terakhir.
   */
  async dispatch(
    id: string,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (usulan.status !== UsulanPindahStatus.DISETUJUI_VERIFIKASI_TERAKHIR) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa dikirim`,
      );
    }

    const oldStatus = usulan.status;
    usulan.status = UsulanPindahStatus.DIKIRIM;
    usulan.tanggalDikirim = new Date();

    const saved = await this.repo.save(usulan);

    this.logAudit(user, usulan, oldStatus, usulan.status, 'Usulan dikirim');
    await this.notifyTU(saved, 'Berkas fisik perlu disiapkan');

    return saved;
  }

  /**
   * TU / Sekretaris menyiapkan berkas fisik.
   */
  async preparePhysical(
    id: string,
    dto: PreparePhysicalDto,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (usulan.status !== UsulanPindahStatus.DIKIRIM) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa disiapkan berkas fisik`,
      );
    }

    const oldStatus = usulan.status;
    usulan.physicalChecklist = dto.checklist ?? null;
    usulan.physicalPreparedBy = Number(user.persnum);
    usulan.physicalPreparedAt = new Date();
    usulan.status = UsulanPindahStatus.BERKAS_FISIK_DIPERSIAPKAN;

    const saved = await this.repo.save(usulan);

    this.logAudit(
      user,
      usulan,
      oldStatus,
      usulan.status,
      'Berkas fisik disiapkan',
    );

    return saved;
  }

  /**
   * Tandai selesai.
   */
  async complete(
    id: string,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (usulan.status !== UsulanPindahStatus.BERKAS_FISIK_DIPERSIAPKAN) {
      throw new BadRequestException(
        `Usulan dengan status ${usulan.status} tidak bisa diselesaikan`,
      );
    }

    const oldStatus = usulan.status;
    usulan.status = UsulanPindahStatus.SELESAI;

    const saved = await this.repo.save(usulan);

    this.logAudit(user, usulan, oldStatus, usulan.status, 'Usulan selesai');
    await this.notifySekretaris(saved, 'Usulan pindah arsip inaktif selesai');

    return saved;
  }

  // ─── BERITA ACARA ─────────────────────────────────────────────────────

  /**
   * Generate nomor berita acara dan simpan URL (placeholder — PDF generation terpisah).
   */
  async generateBeritaAcara(
    id: string,
    user: any,
  ): Promise<UsulanPindahArsipInaktifEntity> {
    const usulan = await this.repo.findOne({ where: { id } });
    if (!usulan) throw new NotFoundException('Usulan tidak ditemukan');

    if (
      usulan.status !== UsulanPindahStatus.DISETUJUI_ATASAN &&
      usulan.status !== UsulanPindahStatus.DISETUJUI_VERIFIKASI_TERAKHIR &&
      usulan.status !== UsulanPindahStatus.DIKIRIM
    ) {
      throw new BadRequestException(
        'Berita acara hanya bisa di-generate setelah persetujuan',
      );
    }

    const nomorBA = `BA/${usulan.nomorUsulan}`;
    usulan.beritaAcaraNomor = nomorBA;
    usulan.beritaAcaraUrl = `/usulan-pindah/${id}/berita-acara.pdf`;

    const saved = await this.repo.save(usulan);

    this.auditTrailService.createAsync({
      action: AuditAction.GENERATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'berita_acara',
      entityId: id,
      description: `Generate berita acara ${nomorBA}`,
      newValue: { beritaAcaraNomor: nomorBA },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
      userRole: user.activeRole?.name ?? user.role,
    });

    return saved;
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────

  /**
   * Ringkasan untuk dashboard card.
   */
  async getSummary(user: any) {
    const qb = this.repo.createQueryBuilder('u');
    const roleName = (user.activeRole?.name ?? user.role ?? '').toUpperCase();
    if (roleName === 'USER') {
      qb.andWhere('u.sekretaris_persnum = :persnum', {
        persnum: Number(user.persnum),
      });
    } else if (roleName === 'ADMIN') {
      qb.andWhere('u.atasan_persnum = :persnum', {
        persnum: Number(user.persnum),
      });
    }

    const total = await qb.getCount();
    const menungguVerifikasi = await qb
      .clone()
      .andWhere('u.status = :s', {
        s: UsulanPindahStatus.MENUNGGU_VERIFIKASI_ATASAN,
      })
      .getCount();
    const disetujui = await qb
      .clone()
      .andWhere('u.status IN (:...statuses)', {
        statuses: [
          UsulanPindahStatus.DISETUJUI_ATASAN,
          UsulanPindahStatus.DISETUJUI_VERIFIKASI_TERAKHIR,
        ],
      })
      .getCount();
    const selesai = await qb
      .clone()
      .andWhere('u.status = :s', { s: UsulanPindahStatus.SELESAI })
      .getCount();

    return { total, menungguVerifikasi, disetujui, selesai };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────

  /**
   * Generate nomor usulan: UPAI/{seq}/{year}
   */
  private async generateNomorUsulan(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.repo.count({
      where: { nomorUsulan: undefined } as any,
    });
    // Cari sequence terakhir untuk tahun ini
    const last = await this.repo
      .createQueryBuilder('u')
      .where('u.nomor_usulan LIKE :pattern', { pattern: `UPAI/%/${year}` })
      .orderBy('u.nomor_usulan', 'DESC')
      .getOne();

    let seq = 1;
    if (last?.nomorUsulan) {
      const match = last.nomorUsulan.match(/UPAI\/(\d+)\/\d+/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    return `UPAI/${String(seq).padStart(3, '0')}/${year}`;
  }

  /**
   * Catat perubahan status ke audit trail (fire-and-forget).
   */
  private logAudit(
    user: any,
    usulan: UsulanPindahArsipInaktifEntity,
    oldStatus: UsulanPindahStatus,
    newStatus: UsulanPindahStatus,
    description: string,
  ) {
    this.auditTrailService.createAsync({
      action: AuditAction.UPDATE,
      module: AuditModule.USULAN_PINDAH,
      entityType: 'usulan_pindah_arsip_inaktif',
      entityId: usulan.id,
      description: `${description} — status: ${oldStatus} → ${newStatus}`,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
      status: AuditStatus.SUCCESS,
      persnum: Number(user.persnum),
      userName: user.nama,
      userRole: user.activeRole?.name ?? user.role,
    });
  }

  /**
   * Notifikasi ke atasan managerial.
   */
  private async notifyAtasan(
    usulan: UsulanPindahArsipInaktifEntity,
    title: string,
  ) {
    try {
      if (!usulan.atasanPositionId) return;
      await this.notificationService.createNotification({
        positionId: String(usulan.atasanPositionId),
        userPersnum: usulan.atasanPersnum,
        type: NotificationType.SYSTEM,
        title,
        body: `Usulan ${usulan.nomorUsulan} — ${usulan.arsipPerihal}`,
        data: {
          action: 'OPEN_USULAN_PINDAH',
          usulanId: usulan.id,
          nomorUsulan: usulan.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notifyAtasan failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Notifikasi ke sekretaris (pengusul).
   */
  private async notifySekretaris(
    usulan: UsulanPindahArsipInaktifEntity,
    title: string,
  ) {
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: usulan.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title,
        body: `Usulan ${usulan.nomorUsulan} — ${usulan.arsipPerihal}`,
        data: {
          action: 'OPEN_USULAN_PINDAH',
          usulanId: usulan.id,
          nomorUsulan: usulan.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notifySekretaris failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Notifikasi ke TU (Corporate Secretary Division).
   * TODO: mapping positionId TU — sementara kirim ke sekretaris.
   */
  private async notifyTU(
    usulan: UsulanPindahArsipInaktifEntity,
    title: string,
  ) {
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: usulan.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title,
        body: `Usulan ${usulan.nomorUsulan} — siapkan berkas fisik`,
        data: {
          action: 'OPEN_USULAN_PINDAH',
          usulanId: usulan.id,
          nomorUsulan: usulan.nomorUsulan,
        },
      });
    } catch (err) {
      this.logger.error(`notifyTU failed: ${err?.message ?? err}`);
    }
  }
}
