import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahShareEntity } from '../entities/naskah-share.entity';
import { NaskahShareRecipientEntity } from '../entities/naskah-share-recipient.entity';
import { NaskahShareLogEntity } from '../entities/naskah-share-log.entity';
import { ShareStatus } from '../enums/share-status.enum';
import { RecipientStatus } from '../enums/recipient-status.enum';
import { ShareLogAksi } from '../enums/share-log-aksi.enum';
import { ShareAccessType } from '../enums/share-access-type.enum';
import { CreateNaskahShareDto, NaskahShareQueryDto } from '../dto';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { Person } from '../../master-data/person/entities/person.entity';
import { NotificationService } from '../../notification/services/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import { StorageService } from '../../storage/services/storage.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class NaskahShareService {
  private readonly logger = new Logger(NaskahShareService.name);

  constructor(
    @InjectRepository(NaskahShareEntity)
    private readonly shareRepo: Repository<NaskahShareEntity>,
    @InjectRepository(NaskahShareRecipientEntity)
    private readonly recipientRepo: Repository<NaskahShareRecipientEntity>,
    @InjectRepository(NaskahShareLogEntity)
    private readonly logRepo: Repository<NaskahShareLogEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  // ────────────────────────────────────────────────────────────────
  // POST /naskah-share — Create share
  // ────────────────────────────────────────────────────────────────

  async createShare(user: JwtPayload, dto: CreateNaskahShareDto) {
    // 1. Validasi naskah exists
    const naskah = await this.naskahRepo.findOne({
      where: { id: dto.naskahId },
    });
    if (!naskah) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }

    // 2. Validasi pemberi memiliki akses ke naskah
    const hasAccess = await this.sirkulasiRepo.findOne({
      where: {
        idNaskah: dto.naskahId,
        position: user.position,
      },
    });
    this.logger.log(
      `[createShare] Access check: naskahId=${dto.naskahId}, position=${user.position}, hasAccess=${!!hasAccess}`,
    );
    if (!hasAccess) {
      throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
    }

    // 3. Validasi penerima tidak include pemberi sendiri
    if (dto.recipientIds.includes(user.position)) {
      throw new BadRequestException(
        'Tidak dapat membagikan naskah kepada diri sendiri',
      );
    }

    // 4. Fetch data penerima dari org_data + person
    const recipients = await this.fetchRecipientData(dto.recipientIds);
    if (recipients.length === 0) {
      throw new BadRequestException('Tidak ada penerima valid yang ditemukan');
    }

    // 5. Validasi penerima tidak duplikat
    const existingShares = await this.shareRepo.find({
      where: { naskahId: dto.naskahId, status: ShareStatus.AKTIF },
      relations: ['recipients'],
    });
    const existingRecipientPositions = existingShares.flatMap((s) =>
      s.recipients.map((r) => r.recipientId),
    );
    const duplicates = recipients.filter((r) =>
      existingRecipientPositions.includes(r.id),
    );
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `${duplicates.map((d) => d.nama).join(', ')} sudah menerima share naskah ini`,
      );
    }

    // 6. Create share + recipients + log dalam transaction
    const shareId = uuidv4();
    const accessType =
      (dto.accessType as ShareAccessType) || ShareAccessType.RENTANG_WAKTU;
    let expiresAt: Date | null = null;
    if (accessType === ShareAccessType.RENTANG_WAKTU && dto.durationDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + dto.durationDays);
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const share = this.shareRepo.create({
        id: shareId,
        naskahId: dto.naskahId,
        pemberiId: user.position,
        pemberiPersnum: user.persnum,
        pemberiNama: user.nama,
        pemberiPositionText: user.positionText,
        catatan: dto.catatan || null,
        accessType,
        durationDays:
          accessType === ShareAccessType.RENTANG_WAKTU
            ? dto.durationDays || null
            : null,
        expiresAt,
        status: ShareStatus.AKTIF,
      });
      await queryRunner.manager.save(share);

      // Create recipient records
      const recipientEntities = recipients.map((r) =>
        this.recipientRepo.create({
          id: uuidv4(),
          shareId,
          recipientId: r.id,
          recipientPersnum: r.persnum,
          recipientNama: r.nama,
          recipientPositionText: r.positionText,
          recipientOrgText: r.organizationText,
          status: RecipientStatus.TERKIRIM,
        }),
      );
      await queryRunner.manager.save(recipientEntities);

      // Log audit trail
      await queryRunner.manager.save(
        this.logRepo.create({
          id: uuidv4(),
          shareId,
          naskahId: dto.naskahId,
          aksi: ShareLogAksi.SHARE,
          actorPersnum: user.persnum,
          actorNama: user.nama,
          actorPositionText: user.positionText,
          catatan: dto.catatan || null,
        }),
      );

      await queryRunner.commitTransaction();

      // 7. Kirim notifikasi ke setiap penerima (di luar transaction)
      for (const recipient of recipients) {
        try {
          await this.notificationService.createNotification(
            {
              positionId: recipient.id,
              userPersnum: recipient.persnum,
              type: NotificationType.NASKAH_SHARE_DITERIMA,
              title: `Anda mendapat akses naskah dari ${user.nama}`,
              body:
                naskah.perihal || dto.catatan || 'Lihat detail di menu Berbagi',
              data: {
                naskahId: dto.naskahId,
                shareId,
                pemberiName: user.nama,
                perihal: naskah.perihal || '',
                action: 'OPEN_SHARE',
              },
            },
            true,
          );
        } catch (err: any) {
          this.logger.warn(
            `⚠️ Failed to send share notification to ${recipient.nama}: ${err?.message}`,
          );
        }
      }

      return {
        success: true,
        statusCode: 201,
        message: 'Naskah berhasil dibagikan',
        data: {
          id: shareId,
          naskahId: dto.naskahId,
          pemberiId: user.position,
          status: ShareStatus.AKTIF,
          accessType,
          durationDays: share.durationDays,
          expiresAt: share.expiresAt,
          createdAt: new Date(),
          recipients: recipientEntities.map((r) => ({
            id: r.id,
            recipientId: r.recipientId,
            nama: r.recipientNama,
            positionText: r.recipientPositionText,
            status: r.status,
          })),
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share — List shares
  // ────────────────────────────────────────────────────────────────

  async getShares(user: JwtPayload, query: NaskahShareQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const tab = query.tab || 'shared-by-me';

    this.logger.log(
      `[getShares] tab=${tab}, position=${user.position}, page=${page}, limit=${limit}`,
    );

    // Auto-fix legacy data: migrate old enum values to new ones
    // Share: DICABUT → BERAKHIR
    await this.shareRepo
      .createQueryBuilder()
      .update()
      .set({ status: ShareStatus.BERAKHIR })
      .where('status = :legacy', { legacy: 'DICABUT' })
      .execute()
      .catch(() => {});

    // Recipient: DICABUT → BERAKHIR, BELUM_DIBACA → TERKIRIM, DIBUKA → DIBACA
    await this.recipientRepo
      .createQueryBuilder()
      .update()
      .set({ status: RecipientStatus.BERAKHIR })
      .where('status = :legacy', { legacy: 'DICABUT' })
      .execute()
      .catch(() => {});

    await this.recipientRepo
      .createQueryBuilder()
      .update()
      .set({ status: RecipientStatus.TERKIRIM })
      .where('status = :legacy', { legacy: 'BELUM_DIBACA' })
      .execute()
      .catch(() => {});

    await this.recipientRepo
      .createQueryBuilder()
      .update()
      .set({ status: RecipientStatus.DIBACA })
      .where('status = :legacy', { legacy: 'DIBUKA' })
      .execute()
      .catch(() => {});

    // Auto-expire: mark expired shares as BERAKHIR BEFORE querying
    await this.shareRepo
      .createQueryBuilder()
      .update()
      .set({
        status: ShareStatus.BERAKHIR,
        revokedAt: new Date(),
        revokedReason: 'Akses kedaluwarsa',
      })
      .where('status = :aktif', { aktif: ShareStatus.AKTIF })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    const qb = this.shareRepo
      .createQueryBuilder('share')
      .leftJoinAndSelect('share.recipients', 'recipients');

    if (tab === 'shared-by-me') {
      qb.where(
        '(share.pemberiId = :positionId OR share.pemberiPersnum = :persnum)',
        { positionId: user.position, persnum: user.persnum },
      );
    } else {
      qb.where(
        '(recipients.recipientId = :positionId OR recipients.recipientPersnum = :persnum)',
        { positionId: user.position, persnum: user.persnum },
      );
    }

    if (query.status) {
      qb.andWhere('share.status = :status', { status: query.status });
    }

    // Join naskah table directly (no entity relation defined)
    qb.leftJoin(NaskahEntity, 'naskah', 'naskah.id = share.naskahId');

    if (query.search) {
      qb.andWhere(
        '(naskah.perihal LIKE :search OR naskah.nomor LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    if (query.jenis) {
      qb.andWhere('naskah.jenis = :jenis', { jenis: query.jenis });
    }

    qb.orderBy('share.createdAt', query.sort === 'ASC' ? 'ASC' : 'DESC');
    qb.skip(skip).take(limit);

    const sql = qb.getQuery();
    this.logger.debug(`[getShares] SQL: ${sql}`);

    const [shares, total] = await qb.getManyAndCount();
    this.logger.log(
      `[getShares] Found ${shares.length} shares, total=${total}`,
    );

    // Auto-mark as DIBACA when viewing shared-to-me tab
    // BUT: skip SEKALI_LIHAT shares — those should only change to DIBACA when actually opened
    if (tab === 'shared-to-me') {
      const unreadShareIds = shares
        .filter((s) =>
          s.accessType !== ShareAccessType.SEKALI_LIHAT &&
          s.recipients.some(
            (r) =>
              (r.recipientId === user.position || r.recipientPersnum === user.persnum) &&
              r.status === RecipientStatus.TERKIRIM,
          ),
        )
        .map((s) => s.id);

      if (unreadShareIds.length > 0) {
        await this.recipientRepo
          .createQueryBuilder()
          .update()
          .set({ status: RecipientStatus.DIBACA })
          .where('share_id IN (:...shareIds)', { shareIds: unreadShareIds })
          .andWhere(
            '(recipient_id = :positionId OR recipient_persnum = :persnum)',
            { positionId: user.position, persnum: user.persnum },
          )
          .andWhere('status = :oldStatus', {
            oldStatus: RecipientStatus.TERKIRIM,
          })
          .execute();

        // Update in-memory for response
        for (const share of shares) {
          if (share.accessType === ShareAccessType.SEKALI_LIHAT) continue;
          for (const r of share.recipients) {
            if (
              (r.recipientId === user.position || r.recipientPersnum === user.persnum) &&
              r.status === RecipientStatus.TERKIRIM
            ) {
              r.status = RecipientStatus.DIBACA;
            }
          }
        }
      }
    }

    // Batch-fetch naskah data to avoid N+1 queries
    const naskahIds = [...new Set(shares.map((s) => s.naskahId))];
    const naskahMap = new Map<string, NaskahEntity>();
    if (naskahIds.length > 0) {
      const naskahs = await this.naskahRepo
        .createQueryBuilder('naskah')
        .where('naskah.id IN (:...ids)', { ids: naskahIds })
        .getMany();
      for (const n of naskahs) {
        naskahMap.set(n.id, n);
      }
    }

    // Enrich with naskah data
    const enriched = await Promise.all(
      shares.map(async (share) => {
        const naskah = naskahMap.get(share.naskahId);

        return {
          id: share.id,
          naskahId: share.naskahId,
          naskahPerihal: naskah?.perihal || '',
          naskahNomor: naskah?.nomor || null,
          naskahJenis: naskah?.jenis || '',
          pemberiId: share.pemberiId,
          pemberiNama: share.pemberiNama,
          pemberiPositionText: share.pemberiPositionText,
          catatan: share.catatan,
          accessType: share.accessType,
          durationDays: share.durationDays,
          expiresAt: share.expiresAt,
          status: share.status,
          createdAt: share.createdAt,
          recipients: share.recipients.map((r) => ({
            id: r.id,
            recipientId: r.recipientId,
            nama: r.recipientNama,
            positionText: r.recipientPositionText,
            orgText: r.recipientOrgText,
            status: r.status,
            openedAt: r.openedAt,
          })),
        };
      }),
    );

    return {
      success: true,
      data: enriched,
      total,
      page,
      limit,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share/:id — Detail share
  // ────────────────────────────────────────────────────────────────

  async getShareDetail(user: JwtPayload, id: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    // Auto-expire check: if expired, update status to BERAKHIR
    if (
      share.status === ShareStatus.AKTIF &&
      share.expiresAt &&
      new Date() > new Date(share.expiresAt)
    ) {
      share.status = ShareStatus.BERAKHIR;
      share.revokedAt = new Date(share.expiresAt);
      share.revokedReason = 'Akses kedaluwarsa';
      await this.shareRepo.save(share);
    }

    // Only pemberi or recipient can view detail
    const isPemberi =
      share.pemberiId === user.position ||
      share.pemberiPersnum === user.persnum;
    const isRecipient = share.recipients.some(
      (r) =>
        r.recipientId === user.position ||
        r.recipientPersnum === user.persnum,
    );
    if (!isPemberi && !isRecipient) {
      throw new ForbiddenException('Anda tidak memiliki akses ke share ini');
    }

    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });

    return {
      success: true,
      data: {
        id: share.id,
        naskahId: share.naskahId,
        naskahPerihal: naskah?.perihal || '',
        naskahNomor: naskah?.nomor || null,
        naskahJenis: naskah?.jenis || '',
        pemberiId: share.pemberiId,
        pemberiNama: share.pemberiNama,
        pemberiPositionText: share.pemberiPositionText,
        catatan: share.catatan,
        accessType: share.accessType,
        durationDays: share.durationDays,
        expiresAt: share.expiresAt,
        status: share.status,
        revokedAt: share.revokedAt,
        revokedReason: share.revokedReason,
        createdAt: share.createdAt,
        recipients: share.recipients.map((r) => ({
          id: r.id,
          recipientId: r.recipientId,
          nama: r.recipientNama,
          positionText: r.recipientPositionText,
          orgText: r.recipientOrgText,
          status: r.status,
          openedAt: r.openedAt,
        })),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE /naskah-share/:shareId/recipients/:recipientId
  // Revoke single recipient
  // ────────────────────────────────────────────────────────────────

  async revokeRecipient(
    user: JwtPayload,
    shareId: string,
    recipientId: string,
    reason?: string,
  ) {
    const share = await this.shareRepo.findOne({
      where: { id: shareId },
      relations: ['recipients'],
    });
    if (!share) throw new NotFoundException('Share tidak ditemukan');

    if (
      share.pemberiId !== user.position &&
      share.pemberiPersnum !== user.persnum
    ) {
      throw new ForbiddenException('Hanya pemberi yang dapat mencabut akses');
    }

    if (share.status !== ShareStatus.AKTIF)
      throw new BadRequestException('Share sudah berakhir sebelumnya');

    const recipient = share.recipients.find(
      (r) => r.recipientId === recipientId,
    );
    if (!recipient)
      throw new NotFoundException('Penerima tidak ditemukan dalam share ini');

    if (recipient.status === RecipientStatus.BERAKHIR)
      throw new BadRequestException(
        'Akses penerima ini sudah berakhir sebelumnya',
      );

    // Revoke this recipient
    recipient.status = RecipientStatus.BERAKHIR;
    await this.recipientRepo.save(recipient);

    // Check if all recipients revoked → mark share as BERAKHIR
    const allRevoked = share.recipients.every(
      (r) => r.id === recipient.id || r.status === RecipientStatus.BERAKHIR,
    );
    if (allRevoked) {
      share.status = ShareStatus.BERAKHIR;
      share.revokedAt = new Date();
      share.revokedReason = reason || null;
      await this.shareRepo.save(share);
    }

    // Audit log
    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });
    await this.logRepo.save(
      this.logRepo.create({
        id: uuidv4(),
        shareId,
        naskahId: share.naskahId,
        aksi: ShareLogAksi.REVOKED,
        actorPersnum: user.persnum,
        actorNama: user.nama,
        actorPositionText: user.positionText,
        recipientPersnum: recipient.recipientPersnum,
        recipientNama: recipient.recipientNama,
        catatan: reason || null,
      }),
    );

    // Notify revoked recipient
    try {
      await this.notificationService.createNotification(
        {
          positionId: recipient.recipientId,
          userPersnum: recipient.recipientPersnum,
          type: NotificationType.NASKAH_SHARE_DICABUT,
          title: `Akses naskah telah berakhir oleh ${user.nama}`,
          body: naskah?.perihal || reason || 'Akses Anda telah berakhir',
          data: {
            naskahId: share.naskahId,
            shareId,
            pemberiName: user.nama,
            perihal: naskah?.perihal || '',
            action: 'OPEN_SHARE',
          },
        },
        true,
      );
    } catch (err: any) {
      this.logger.warn(
        `⚠️ Failed to send revoke notification: ${err?.message}`,
      );
    }

    return {
      success: true,
      message: `Akses ${recipient.recipientNama} berhasil diakhiri`,
      data: {
        shareId,
        recipientId,
        recipientNama: recipient.recipientNama,
        shareStatus: share.status,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE /naskah-share/:id — Revoke share
  // ────────────────────────────────────────────────────────────────

  async revokeShare(user: JwtPayload, id: string, reason?: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    // Only pemberi can revoke
    if (
      share.pemberiId !== user.position &&
      share.pemberiPersnum !== user.persnum
    ) {
      throw new ForbiddenException(
        'Hanya pemberi yang dapat mencabut akses share',
      );
    }

    // Must be AKTIF
    if (share.status !== ShareStatus.AKTIF) {
      throw new BadRequestException('Share sudah berakhir sebelumnya');
    }

    // Update share status
    share.status = ShareStatus.BERAKHIR;
    share.revokedAt = new Date();
    share.revokedReason = reason || null;
    await this.shareRepo.save(share);

    // Log audit trail
    await this.logRepo.save(
      this.logRepo.create({
        id: uuidv4(),
        shareId: id,
        naskahId: share.naskahId,
        aksi: ShareLogAksi.REVOKED,
        actorPersnum: user.persnum,
        actorNama: user.nama,
        actorPositionText: user.positionText,
        catatan: reason || null,
      }),
    );

    // Fetch naskah data for notification
    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });

    // Send notification to all recipients
    for (const recipient of share.recipients) {
      try {
        await this.notificationService.createNotification(
          {
            positionId: recipient.recipientId,
            userPersnum: recipient.recipientPersnum,
            type: NotificationType.NASKAH_SHARE_DICABUT,
            title: `Akses naskah telah berakhir oleh ${user.nama}`,
            body: naskah?.perihal || reason || 'Akses Anda telah berakhir',
            data: {
              naskahId: share.naskahId,
              shareId: id,
              pemberiName: user.nama,
              perihal: naskah?.perihal || '',
              action: 'OPEN_SHARE',
            },
          },
          true,
        );
      } catch (err: any) {
        this.logger.warn(
          `⚠️ Failed to send revoke notification to ${recipient.recipientNama}: ${err?.message}`,
        );
      }
    }

    return {
      success: true,
      message: 'Akses share berhasil diakhiri',
      data: {
        id: share.id,
        status: ShareStatus.BERAKHIR,
        revokedAt: share.revokedAt,
        revokedReason: share.revokedReason,
        affectedRecipients: share.recipients.length,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // POST /naskah-share/:id/open — Open naskah
  // ────────────────────────────────────────────────────────────────

  async openNaskah(user: JwtPayload, id: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    // Check if user is the sender (pemberi) or a recipient
    const isPemberi =
      share.pemberiId === user.position ||
      share.pemberiPersnum === user.persnum;
    const recipientRecord = share.recipients.find(
      (r) =>
        r.recipientId === user.position ||
        r.recipientPersnum === user.persnum,
    );

    if (!isPemberi && !recipientRecord) {
      throw new ForbiddenException('Anda tidak memiliki akses ke share ini');
    }

    // Must be AKTIF — but pemberi can always open (even if share is BERAKHIR)
    if (share.status !== ShareStatus.AKTIF && !isPemberi) {
      throw new BadRequestException('Share tidak aktif atau sudah berakhir');
    }

    // Check expiry for time-limited shares (pemberi always allowed)
    if (!isPemberi && share.accessType === ShareAccessType.RENTANG_WAKTU && share.expiresAt) {
      if (new Date() > new Date(share.expiresAt)) {
        throw new BadRequestException('Akses share sudah kedaluwarsa');
      }
    }

    // Fetch naskah for PDF URL and notifications
    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });

    // Resolve PDF URL FIRST — before updating any status
    let pdfUrl: string | null = null;
    if (naskah?.final_pdf) {
      try {
        pdfUrl = await this.storageService.getFileUrl(naskah.final_pdf);
      } catch (err: any) {
        this.logger.warn(
          `⚠️ Failed to resolve PDF URL for naskah ${share.naskahId}: ${err?.message}`,
        );
      }
    }

    // If no PDF available, reject before changing status
    if (!pdfUrl) {
      throw new BadRequestException(
        'Dokumen PDF tidak tersedia untuk naskah ini',
      );
    }

    // Update recipient status only if user is a recipient
    if (recipientRecord) {
      // View-once: check if already opened or ended
      if (share.accessType === ShareAccessType.SEKALI_LIHAT) {
        if (
          recipientRecord.status === RecipientStatus.DIBACA ||
          recipientRecord.status === RecipientStatus.BERAKHIR
        ) {
          throw new BadRequestException(
            'Share ini hanya dapat dibuka sekali. Akses sudah berakhir.',
          );
        }
      }

      recipientRecord.status = RecipientStatus.DIBACA;
      recipientRecord.openedAt = new Date();
      await this.recipientRepo.save(recipientRecord);

      // View-once: auto-revoke access after first open — only THIS recipient ends
      if (share.accessType === ShareAccessType.SEKALI_LIHAT) {
        recipientRecord.status = RecipientStatus.BERAKHIR;
        await this.recipientRepo.save(recipientRecord);

        // Update in-memory copy for the allRevoked check
        const recipientInList = share.recipients.find(
          (r) => r.id === recipientRecord.id,
        );
        if (recipientInList) recipientInList.status = RecipientStatus.BERAKHIR;

        // Only close the entire share if ALL recipients have ended
        const allRevoked = share.recipients.every(
          (r) => r.status === RecipientStatus.BERAKHIR,
        );
        if (allRevoked) {
          share.status = ShareStatus.BERAKHIR;
          share.revokedAt = new Date();
          share.revokedReason =
            'Semua penerima sudah menggunakan akses sekali lihat';
          await this.shareRepo.save(share);
        }

        this.logger.log(
          `[openNaskah] View-once: recipient ${user.nama} auto-revoked for share ${id}`,
        );
      }

      // Log audit trail
      await this.logRepo.save(
        this.logRepo.create({
          id: uuidv4(),
          shareId: id,
          naskahId: share.naskahId,
          aksi: ShareLogAksi.OPENED,
          actorPersnum: user.persnum,
          actorNama: user.nama,
          actorPositionText: user.positionText,
          recipientPersnum: share.pemberiPersnum,
          recipientNama: share.pemberiNama,
        }),
      );

      // Send notification to pemberi
      try {
        await this.notificationService.createNotification(
          {
            positionId: share.pemberiId,
            userPersnum: share.pemberiPersnum,
            type: NotificationType.NASKAH_SHARE_DIBUKA,
            title: `${user.nama} membuka naskah yang Anda bagikan`,
            body: naskah?.perihal || '',
            data: {
              naskahId: share.naskahId,
              shareId: id,
              recipientName: user.nama,
              perihal: naskah?.perihal || '',
              action: 'OPEN_INBOX_DETAIL',
            },
          },
          true,
        );
      } catch (err: any) {
        this.logger.warn(
          `⚠️ Failed to send open notification to pemberi: ${err?.message}`,
        );
      }
    }

    return {
      success: true,
      message: 'Naskah berhasil dibuka',
      data: {
        naskahId: share.naskahId,
        perihal: naskah?.perihal || '',
        nomor: naskah?.nomor || null,
        jenis: naskah?.jenis || '',
        pemberi: {
          id: share.pemberiId,
          nama: share.pemberiNama,
          positionText: share.pemberiPositionText,
        },
        sharedAt: share.createdAt,
        accessType: share.accessType,
        expiresAt: share.expiresAt,
        pdfUrl,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // PATCH /naskah-share/:id/read — Mark as read
  // ────────────────────────────────────────────────────────────────

  async markAsRead(user: JwtPayload, id: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    const recipientRecord = share.recipients.find(
      (r) =>
        r.recipientId === user.position ||
        r.recipientPersnum === user.persnum,
    );
    if (!recipientRecord) {
      throw new ForbiddenException('Anda bukan penerima share ini');
    }

    // Only update if still TERKIRIM
    // Skip SEKALI_LIHAT — status should only change when actually opening the PDF
    if (recipientRecord.status === RecipientStatus.TERKIRIM && share.accessType !== ShareAccessType.SEKALI_LIHAT) {
      recipientRecord.status = RecipientStatus.DIBACA;
      await this.recipientRepo.save(recipientRecord);
    }

    return { success: true, message: 'Share ditandai sudah dibaca' };
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share/search-user — Search user
  // ────────────────────────────────────────────────────────────────

  async searchUsers(user: JwtPayload, query: string) {
    if (!query || query.length < 2) {
      return { success: true, data: [] };
    }

    const searchTerm = `%${query}%`;
    const persnumSearch = isNaN(Number(query)) ? null : Number(query);

    // Find persons
    const persons = await this.personRepo.find({
      where: persnumSearch
        ? [
            { persnum: persnumSearch, endDate: '9999-12-31' },
            { name: Like(searchTerm), endDate: '9999-12-31' },
            { uname: Like(searchTerm), endDate: '9999-12-31' },
          ]
        : [
            { name: Like(searchTerm), endDate: '9999-12-31' },
            { uname: Like(searchTerm), endDate: '9999-12-31' },
          ],
      order: { name: 'ASC' },
      take: 20,
    });

    if (persons.length === 0) {
      return { success: true, data: [] };
    }

    // Fetch org_data for position info
    const orgData = await this.orgDataService.findLatestOrg();
    const persnums = persons
      .map((p) => p.persnum)
      .filter((p): p is number => p != null);

    const positionInfoMap = new Map<
      number,
      {
        id: string;
        positionText: string;
        organizationText: string;
      }
    >();

    if (orgData?.position_json && Array.isArray(orgData.position_json)) {
      for (const pos of orgData.position_json) {
        const pn = pos.persnum_person ?? pos.persnum;
        if (persnums.includes(pn)) {
          if (!positionInfoMap.has(pn)) {
            positionInfoMap.set(pn, {
              id: String(pos.position || ''),
              positionText: pos.position_text || '',
              organizationText: pos.organization_text || '',
            });
          }
        }
      }
    }

    const results = persons
      .map((p) => {
        const posInfo = positionInfoMap.get(p.persnum!);
        if (!posInfo) return null;
        // Exclude current user
        if (posInfo.id === user.position) return null;
        return {
          id: posInfo.id,
          persnum: p.persnum,
          nama: p.name || '',
          positionText: posInfo.positionText,
          organizationText: posInfo.organizationText,
        };
      })
      .filter(Boolean);

    return { success: true, data: results };
  }

  // ────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────

  private async fetchRecipientData(recipientIds: string[]): Promise<
    Array<{
      id: string;
      persnum: number;
      nama: string;
      positionText: string;
      organizationText: string;
    }>
  > {
    const orgData = await this.orgDataService.findLatestOrg();
    if (!orgData?.position_json || !Array.isArray(orgData.position_json)) {
      return [];
    }

    const results: Array<{
      id: string;
      persnum: number;
      nama: string;
      positionText: string;
      organizationText: string;
    }> = [];

    this.logger.debug(
      `[fetchRecipientData] Looking for recipientIds: ${JSON.stringify(recipientIds)}`,
    );
    this.logger.debug(
      `[fetchRecipientData] Total position_json entries: ${orgData.position_json.length}`,
    );

    for (const pos of orgData.position_json) {
      const posId = String(pos.position || '');
      if (recipientIds.includes(posId)) {
        this.logger.debug(
          `[fetchRecipientData] Matched position ${posId}, persnum_person=${pos.persnum_person}, persnum=${pos.persnum}`,
        );
        // Find person by persnum
        const persnum = Number(pos.persnum_person ?? pos.persnum);
        if (!persnum || isNaN(persnum)) {
          this.logger.warn(
            `[fetchRecipientData] Position ${posId} has no valid persnum, skipping`,
          );
          continue;
        }
        let person = await this.personRepo.findOne({
          where: { persnum, endDate: '9999-12-31' },
        });

        if (!person) {
          // Fallback: try without endDate filter
          this.logger.debug(
            `[fetchRecipientData] Person not found with endDate filter, trying without. persnum=${persnum}`,
          );
          person = await this.personRepo.findOne({
            where: { persnum },
          });
        }

        if (person) {
          this.logger.debug(
            `[fetchRecipientData] Found person: ${person.name} (persnum=${person.persnum})`,
          );
          results.push({
            id: posId,
            persnum,
            nama: person.name || '',
            positionText: pos.position_text || '',
            organizationText: pos.organization_text || '',
          });
        } else {
          this.logger.warn(
            `[fetchRecipientData] No person found for persnum=${persnum} (position ${posId})`,
          );
        }
      }
    }

    this.logger.debug(
      `[fetchRecipientData] Returning ${results.length} results`,
    );
    return results;
  }
}
