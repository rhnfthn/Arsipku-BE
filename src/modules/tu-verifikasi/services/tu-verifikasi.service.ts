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
} from '../dto/tu-verifikasi.dto';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities/notification.entity';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class TuVerifikasiService {
  private readonly logger = new Logger(TuVerifikasiService.name);

  constructor(
    @InjectRepository(TransferActiveToInactiveEntity)
    private readonly transferRepo: Repository<TransferActiveToInactiveEntity>,
    private readonly notificationService: NotificationService,
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
   *  Bisa menerima dari status BERKAS_FISIK_SESUAI (sudah diverifikasi)
   *  atau DIKIRIM/MENUNGGU_VERIFIKASI_BERKAS_FISIK (belum diverifikasi —
   *  verifikasi sesuai + ajukan dalam satu operasi).
   */
  async ajukanAtasanTu(id: string, user: JwtPayload, dto: AjukanAtasanTuDto) {
    const transfer = await this.findOneForTu(id);

    const allowedStatuses = [
      TransferActiveToInactiveStatus.BERKAS_FISIK_SESUAI,
      TransferActiveToInactiveStatus.DIKIRIM,
      TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK,
    ];
    if (!allowedStatuses.includes(transfer.status)) {
      throw new BadRequestException(
        `Status ${transfer.status} tidak bisa diajukan ke Atasan TU`,
      );
    }

    // Jika belum diverifikasi, lakukan verifikasi sesuai sekaligus
    if (
      transfer.status === TransferActiveToInactiveStatus.DIKIRIM ||
      transfer.status ===
        TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_BERKAS_FISIK
    ) {
      transfer.physicalVerifiedBy = Number(user.persnum);
      transfer.physicalVerifiedAt = new Date();
      transfer.tuPersnum = Number(user.persnum);
      transfer.tuName = user.nama ?? String(user.persnum);
    }

    const oldStatus = transfer.status;
    transfer.status =
      TransferActiveToInactiveStatus.MENUNGGU_VERIFIKASI_PERSETUJUAN_TU;
    transfer.atasanTuPersnum = Number(dto.atasanTuPersnum);
    transfer.tuApprovedBy = Number(user.persnum);
    transfer.tuApprovedAt = new Date();

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

  /** Daftar atasan managerial TU (untuk dropdown pilih atasan TU). */
  async getAtasanTuList() {
    // Ambil dari organization_tu dengan role unit_dokumen? Tidak.
    // Atasan TU = user dengan role atasan_managerial di Unit Tata Naskah.
    // Untuk sementara, return list dari user_role dengan role ADMIN/SUPERADMIN
    // yang ada di Unit Tata Naskah. Implementasi sederhana: query org_data.
    // TODO: Implementasi proper query ke organization_tu / rbac.
    return [];
  }
}
