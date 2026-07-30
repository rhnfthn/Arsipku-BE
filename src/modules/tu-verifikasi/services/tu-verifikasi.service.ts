import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferActiveToInactiveEntity } from '../../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { TransferActiveToInactiveStatus } from '../../transfer-active-to-inactive/enums/transfer-status.enum';
import {
  TuFilterDto,
  VerifikasiBerkasDto,
  AjukanAtasanTuDto,
  KembalikanDto,
  SetujuiPenerimaanDto,
  TolakPenerimaanDto,
  SetujuiTerakhirDto,
  SelesaiPenataanDto,
} from '../dto/tu-verifikasi.dto';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities/notification.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class TuVerifikasiService {
  private readonly logger = new Logger(TuVerifikasiService.name);

  constructor(
    @InjectRepository(TransferActiveToInactiveEntity)
    private readonly transferRepo: Repository<TransferActiveToInactiveEntity>,
    private readonly notificationService: NotificationService,
    private readonly orgDataService: OrgDataService,
  ) {}

  /** Status yang relevan untuk TU (notifikasi usulan masuk). */
  private readonly TU_STATUSES = [
    TransferActiveToInactiveStatus.DIKIRIM,
    TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
    TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
    TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI,
    TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
  ];

  /**
   * Daftar usulan yang masuk ke TU (notifikasi usulan pindah arsip).
   * Status: DIKIRIM, MENUNGGU_VERIFIKASI_BERKAS_FISIK, BERKAS_FISIK_SESUAI,
   * BERKAS_FISIK_TIDAK_SESUAI, MENUNGGU_VERIFIKASI_PERSETUJUAN_TU.
   */
  async findAllNotifikasi(filter: TuFilterDto) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 10);

    const qb = this.transferRepo.createQueryBuilder('t');

    // Filter status: default semua status TU, atau filter spesifik
    if (filter.status) {
      qb.andWhere('t.status = :status', { status: filter.status });
    } else {
      qb.andWhere('t.status IN (:...statuses)', { statuses: this.TU_STATUSES });
    }

    if (filter.search) {
      qb.andWhere(
        '(t.nomor_usulan LIKE :search OR t.arsip_perihal LIKE :search OR t.sekretaris_name LIKE :search OR t.atasan_name LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('t.tgl_dikirim', 'DESC').addOrderBy('t.created_at', 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Detail usulan untuk TU. */
  async findOneForTu(id: string) {
    const transfer = await this.transferRepo.findOne({ where: { id } });
    if (!transfer) {
      throw new NotFoundException('Usulan tidak ditemukan');
    }
    return transfer;
  }

  /** Verifikasi berkas fisik oleh TU. */
  async verifikasiBerkas(
    id: string,
    user: JwtPayload,
    dto: VerifikasiBerkasDto,
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diverifikasi berkas fisik`,
      );
    }

    const oldStatus = transfer.status;
    transfer.physicalVerificationNote = dto.catatan ?? null;
    transfer.physicalVerifiedBy = Number(user.persnum);
    transfer.physicalVerifiedAt = new Date();
    transfer.tuPersnum = Number(user.persnum);
    transfer.tuName = user.nama ?? String(user.persnum);

    if (dto.sesuai) {
      transfer.status = TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI;
    } else {
      transfer.status =
        TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI;
    }

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke sekretaris
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title: dto.sesuai ? 'Berkas Fisik Sesuai' : 'Berkas Fisik Tidak Sesuai',
        body: `Usulan ${saved.nomorUsulan} — berkas fisik ${
          dto.sesuai ? 'sesuai' : 'tidak sesuai'
        }.`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to send notification: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Ajukan ke Atasan Managerial TU (setelah berkas fisik sesuai).
   *  Status tetap DIKIRIM (Menunggu Verifikasi) — hanya tandai field verifikasi
   *  & atasan TU. Tidak ubah status agar di halaman TU tetap terlihat sebagai
   *  "Menunggu Verifikasi".
   */
  async ajukanAtasanTu(id: string, user: JwtPayload, dto: AjukanAtasanTuDto) {
    const transfer = await this.findOneForTu(id);

    const allowedStatuses = [
      TransferActiveToInactiveStatus.DIKIRIM,
      TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
    ];
    if (!allowedStatuses.includes(transfer.status)) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diajukan ke Atasan TU`,
      );
    }

    // Tandai verifikasi berkas fisik sesuai + ajukan ke atasan TU
    transfer.physicalVerifiedBy = Number(user.persnum);
    transfer.physicalVerifiedAt = new Date();
    transfer.tuPersnum = Number(user.persnum);
    transfer.tuName = user.nama ?? String(user.persnum);
    transfer.atasanTuPersnum = Number(dto.atasanTuPersnum);
    transfer.tuApprovedBy = Number(user.persnum);
    transfer.tuApprovedAt = new Date();
    // Status tetap DIKIRIM (Menunggu Verifikasi) — tidak diubah

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke Atasan Managerial TU
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: Number(dto.atasanTuPersnum),
        type: NotificationType.SYSTEM,
        title: 'Usulan Pindah Arsip Menunggu Persetujuan',
        body: `Usulan ${saved.nomorUsulan} telah diverifikasi TU dan menunggu persetujuan Anda.`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to send notification: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Kembalikan ke Atasan/Sekretaris (berkas tidak sesuai). */
  async kembalikanKeAtasan(id: string, user: JwtPayload, dto: KembalikanDto) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK &&
      transfer.status !== TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa dikembalikan`,
      );
    }

    transfer.status = TransferActiveToInactiveStatus.BERKAS_FISIK_TIDAK_SESUAI;
    transfer.physicalVerificationNote = dto.alasan;
    transfer.physicalVerifiedBy = Number(user.persnum);
    transfer.physicalVerifiedAt = new Date();
    transfer.tuPersnum = Number(user.persnum);
    transfer.tuName = user.nama ?? String(user.persnum);

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke sekretaris
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title: 'Berkas Dikembalikan',
        body: `Usulan ${saved.nomorUsulan} dikembalikan oleh TU: ${dto.alasan}`,
        data: {
          action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE',
          id: saved.id,
          nomorUsulan: saved.nomorUsulan,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to send notification: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Daftar atasan managerial TU (untuk dropdown pilih atasan TU).
   * Cari di org_data position_json: organization yang mengandung "Corporate Secretary",
   * ambil yang chief=1 (atasan, bukan staff), punya persnum_person.
   */
  async getAtasanTuList() {
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (!latestOrgData?.position_json || !Array.isArray(latestOrgData.position_json)) {
        return [];
      }

      const positions = latestOrgData.position_json as any[];

      // Cari position di organization "Corporate Secretary" dengan chief=1
      const atasanTu = positions
        .filter((p) => {
          const orgText = (p.organization_text || '').toUpperCase();
          return (
            orgText.includes('CORPORATE SECRETARY') &&
            p.chief === 1 &&
            p.persnum_person
          );
        })
        .map((p) => ({
          persnum: p.persnum_person,
          name: p.persnum_person_text,
          position: p.position,
          positionText: p.position_text,
          organization: p.organization_id,
          organizationText: p.organization_text,
          displayText: `${p.persnum_person_text} — ${p.position_text} (${p.persnum_person})`,
        }));

      return atasanTu;
    } catch (error) {
      this.logger.warn(
        `getAtasanTuList failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ============================================
  // ATASAN MANAGERIAL TU — Verifikasi Persetujuan
  // ============================================

  /** Status yang relevan untuk Atasan Managerial TU. */
  private readonly ATASAN_TU_STATUSES = [
    TransferActiveToInactiveStatus.DIKIRIM,
    TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU,
    TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TERAKHIR_TU,
    TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
  ];

  /** Daftar usulan untuk Atasan Managerial TU. */
  async findAllAtasanTu(filter: TuFilterDto) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 10);

    const qb = this.transferRepo.createQueryBuilder('t');

    // Hanya usulan yang sudah diajukan TU (tuApprovedAt terisi)
    qb.andWhere('t.tu_approved_at IS NOT NULL');

    if (filter.status) {
      qb.andWhere('t.status = :status', { status: filter.status });
    } else {
      qb.andWhere('t.status IN (:...statuses)', {
        statuses: this.ATASAN_TU_STATUSES,
      });
    }

    if (filter.search) {
      qb.andWhere(
        '(t.nomor_usulan LIKE :search OR t.arsip_perihal LIKE :search OR t.sekretaris_name LIKE :search OR t.tu_name LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('t.tu_approved_at', 'DESC').addOrderBy('t.created_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Setujui penerimaan oleh Atasan TU. */
  async setujuiPenerimaan(id: string, user: JwtPayload, dto: { catatanVerifikasi?: string }) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa disetujui penerimaan`,
      );
    }

    transfer.status =
      TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU;
    transfer.atasanTuPersnum = transfer.atasanTuPersnum ?? Number(user.persnum);
    transfer.atasanTuName = transfer.atasanTuName ?? user.nama ?? String(user.persnum);
    transfer.physicalVerificationNote = dto.catatanVerifikasi ?? transfer.physicalVerificationNote;

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke TU
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.tuPersnum ?? undefined,
        type: NotificationType.SYSTEM,
        title: 'Penerimaan Disetujui Atasan TU',
        body: `Usulan ${saved.nomorUsulan} penerimaan disetujui oleh Atasan TU.`,
        data: { action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE', id: saved.id, nomorUsulan: saved.nomorUsulan },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Tolak penerimaan oleh Atasan TU. */
  async tolakPenerimaan(id: string, user: JwtPayload, dto: { alasanPenolakan: string }) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !== TransferActiveToInactiveStatus.DIKIRIM &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa ditolak penerimaan`,
      );
    }

    transfer.status =
      TransferActiveToInactiveStatus.DITOLAK_PERSETUJUAN_TU;
    transfer.rejectedNote = dto.alasanPenolakan;

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke TU
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.tuPersnum ?? undefined,
        type: NotificationType.SYSTEM,
        title: 'Penerimaan Ditolak Atasan TU',
        body: `Usulan ${saved.nomorUsulan} penerimaan ditolak: ${dto.alasanPenolakan}`,
        data: { action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE', id: saved.id, nomorUsulan: saved.nomorUsulan },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    return saved;
  }

  /** Setujui persetujuan terakhir oleh Atasan TU → ARSIP_INAKTIF_DITERIMA. */
  async setujuiTerakhir(id: string, user: JwtPayload, dto: { catatanVerifikasi?: string }) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !==
        TransferActiveToInactiveStatus.DISETUJUI_PERSETUJUAN_TU &&
      transfer.status !==
        TransferActiveToInactiveStatus.MENUNGGU_PERSETUJUAN_TERAKHIR_TU
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa disetujui terakhir`,
      );
    }

    transfer.status =
      TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA;
    transfer.tuFinalApprovedBy = Number(user.persnum);
    transfer.tuFinalApprovedAt = new Date();
    transfer.receivedAt = new Date();

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke TU untuk penataan arsip
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.tuPersnum ?? undefined,
        type: NotificationType.SYSTEM,
        title: 'Arsip Diterima — Siap Penataan',
        body: `Usulan ${saved.nomorUsulan} disetujui terakhir oleh Atasan TU. Silakan lakukan penataan arsip.`,
        data: { action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE', id: saved.id, nomorUsulan: saved.nomorUsulan },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    return saved;
  }

  // ============================================
  // TU — Penataan Arsip Inaktif
  // ============================================

  /** Status untuk penataan arsip. */
  private readonly PENATAAN_STATUSES = [
    TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA,
    TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF,
    TransferActiveToInactiveStatus.SELESAI,
  ];

  /** Daftar usulan untuk penataan arsip di TU. */
  async findAllPenataan(filter: TuFilterDto) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, filter.limit ?? 10);

    const qb = this.transferRepo.createQueryBuilder('t');

    if (filter.status) {
      qb.andWhere('t.status = :status', { status: filter.status });
    } else {
      qb.andWhere('t.status IN (:...statuses)', {
        statuses: this.PENATAAN_STATUSES,
      });
    }

    if (filter.search) {
      qb.andWhere(
        '(t.nomor_usulan LIKE :search OR t.arsip_perihal LIKE :search OR t.sekretaris_name LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('t.received_at', 'DESC').addOrderBy('t.created_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Selesai penataan arsip → SELESAI. */
  async selesaiPenataan(
    id: string,
    user: JwtPayload,
    dto: {
      lokasi?: string;
      rak?: string;
      baris?: string;
      kolom?: string;
      keterangan?: string;
    },
  ) {
    const transfer = await this.findOneForTu(id);

    if (
      transfer.status !==
        TransferActiveToInactiveStatus.ARSIP_INAKTIF_DITERIMA &&
      transfer.status !==
        TransferActiveToInactiveStatus.PENATAAN_ARSIP_INAKTIF
    ) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diselesaikan penataan`,
      );
    }

    transfer.lokasiPenataan = dto.lokasi ?? null;
    transfer.rak = dto.rak ?? null;
    transfer.baris = dto.baris ?? null;
    transfer.kolom = dto.kolom ?? null;
    transfer.keteranganPenataan = dto.keterangan ?? null;
    transfer.status = TransferActiveToInactiveStatus.SELESAI;
    transfer.arrangedAt = new Date();

    const saved = await this.transferRepo.save(transfer);

    // Notifikasi ke sekretaris
    try {
      await this.notificationService.createNotification({
        positionId: '0',
        userPersnum: transfer.sekretarisPersnum,
        type: NotificationType.SYSTEM,
        title: 'Penataan Arsip Selesai',
        body: `Usulan ${saved.nomorUsulan} arsip telah selesai ditata di ${dto.lokasi || 'lokasi'}.`,
        data: { action: 'OPEN_TRANSFER_ACTIVE_TO_INACTIVE', id: saved.id, nomorUsulan: saved.nomorUsulan },
      });
    } catch (e) {
      this.logger.warn(`notify failed: ${(e as Error).message}`);
    }

    return saved;
  }
}
