import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationEntity,
  NotificationType,
  NaskahMasukNotificationData,
  DisposisiNotificationData,
} from '../entities';
import {
  CreateNotificationDto,
  NotificationQueryDto,
  CreateNaskahMasukNotificationDto,
} from '../dto';
import { FcmService } from '../../fcm/services';
import { NotificationGateway } from '../gateways';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    private readonly dataSource: DataSource,
    private readonly fcmService: FcmService,
    private readonly notificationGateway: NotificationGateway,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {
    this.logger.log('✅ NotificationService initialized');
  }

  private async emitInboxCountIfNeeded(saved: NotificationEntity) {
    const action = String(saved.data?.action || '');
    const opensInbox =
      action === 'OPEN_INBOX_DETAIL' ||
      action === 'OPEN_DISPOSISI_DETAIL' ||
      saved.type === NotificationType.NASKAH_MASUK ||
      saved.type === NotificationType.NASKAH_TEMBUSAN ||
      saved.type === NotificationType.DISPOSISI ||
      saved.type === NotificationType.DISPOSISI_SELESAI ||
      saved.type === NotificationType.KONSEP_DISETUJUI ||
      saved.type === NotificationType.KONSEP_DITOLAK;

    if (!opensInbox || !saved.positionId) return;

    const result = await this.dataSource.query(
      `
        SELECT COUNT(*) as count
        FROM naskah_sirkulasi s
        INNER JOIN naskah n ON s.id_naskah = n.id
        WHERE s.position = ?
          AND s.sirkuler IN ('penerima', 'tembusan')
          AND s.is_draft = 0
          AND (s.is_konsep = 0 OR n.jenis = 'K')
          AND s.send_read_time IS NULL
          AND n.status IN ('final', 'final_tte')
      `,
      [saved.positionId],
    );
    const count = parseInt(result?.[0]?.count || '0', 10);
    this.realtimeEmitService.emitInboxCount(saved.positionId, count);
  }

  /**
   * Create notification and optionally send push notification
   */
  async createNotification(
    dto: CreateNotificationDto,
    sendPush = true,
  ): Promise<NotificationEntity> {
    this.logger.log('='.repeat(60));
    this.logger.log('📥 [createNotification] CALLED');
    this.logger.log(`📥 DTO: ${JSON.stringify(dto, null, 2)}`);
    this.logger.log(`📥 sendPush: ${sendPush}`);

    try {
      // Sanitasi body di titik pusat: jangan pernah murni angka / kosong.
      // Perihal test sering diisi "12", "23", "111" → notifikasi tampil angka.
      const safeBody = this.sanitizeBody(dto.body, dto.title || 'Notifikasi');

      const notification = this.notificationRepository.create({
        id: uuidv4(),
        positionId: dto.positionId,
        userPersnum: dto.userPersnum || null,
        type: dto.type,
        title: dto.title,
        body: safeBody,
        data: dto.data || null,
        isRead: false,
      });

      this.logger.log(
        `📝 [createNotification] Created entity: ${JSON.stringify(notification, null, 2)}`,
      );

      const saved = await this.notificationRepository.save(notification);
      this.logger.log(
        `✅ [createNotification] SAVED to database! ID: ${saved.id}`,
      );

      // Send push notification if userPersnum is provided
      if (sendPush && dto.userPersnum) {
        this.logger.log(
          `📤 [createNotification] Sending push notification to persnum: ${dto.userPersnum}`,
        );
        // Include notificationId in data payload so mobile can dedup
        // across FCM and WebSocket sources.
        const dataWithId = {
          ...(this.convertDataToString(dto.data) || {}),
          notificationId: saved.id,
        };
        await this.fcmService.sendToUser(
          dto.userPersnum,
          dto.title,
          safeBody, // body yang sudah disanitasi — bukan dto.body mentah
          dataWithId,
        );
        this.logger.log(`✅ [createNotification] Push notification sent`);
      } else {
        this.logger.log(
          `⏭️ [createNotification] Skip push: sendPush=${sendPush}, userPersnum=${dto.userPersnum}`,
        );
      }

      // Emit realtime via WebSocket
      try {
        this.notificationGateway.emitNewNotification(
          saved.positionId,
          saved.userPersnum,
          saved,
        );
        const unread = await this.getUnreadCount(saved.positionId);
        this.notificationGateway.emitUnreadCount(
          saved.positionId,
          saved.userPersnum,
          unread,
        );
        await this.emitInboxCountIfNeeded(saved);
      } catch (err: any) {
        this.logger.warn(
          `⚠️ [createNotification] WS emit failed: ${err?.message}`,
        );
      }

      return saved;
    } catch (error) {
      this.logger.error(`❌ [createNotification] ERROR: ${error.message}`);
      this.logger.error(`❌ [createNotification] Stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Create notification for naskah masuk (kotak masuk)
   */
  async createNaskahMasukNotification(
    dto: CreateNaskahMasukNotificationDto,
    sendPush = true,
  ): Promise<NotificationEntity> {
    this.logger.log('='.repeat(60));
    this.logger.log('🔔 [createNaskahMasukNotification] CALLED');
    this.logger.log(`🔔 DTO: ${JSON.stringify(dto, null, 2)}`);
    this.logger.log(`🔔 sendPush: ${sendPush}`);

    try {
      const jenisLabel = this.getJenisLabel(dto.jenis);
      const type = dto.isTembusan
        ? NotificationType.NASKAH_TEMBUSAN
        : NotificationType.NASKAH_MASUK;
      const title = `${dto.pengirimPosition}`;

      const body = `${dto.perihal}`;

      this.logger.log(
        `🔔 [createNaskahMasukNotification] jenisLabel: ${jenisLabel}`,
      );
      this.logger.log(`🔔 [createNaskahMasukNotification] type: ${type}`);
      this.logger.log(`🔔 [createNaskahMasukNotification] title: ${title}`);
      this.logger.log(`🔔 [createNaskahMasukNotification] body: ${body}`);

      const data: NaskahMasukNotificationData = {
        naskahId: dto.naskahId,
        sirkulasiId: dto.sirkulasiId,
        jenis: dto.jenis as 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
        nomor: dto.nomor || null,
        perihal: dto.perihal,
        pengirim: dto.pengirim,
        pengirimPosition: dto.pengirimPosition,
        action: 'OPEN_INBOX_DETAIL',
      };

      this.logger.log(
        `🔔 [createNaskahMasukNotification] data: ${JSON.stringify(data, null, 2)}`,
      );

      const result = await this.createNotification(
        {
          positionId: dto.positionId,
          userPersnum: dto.userPersnum,
          type,
          title,
          body,
          data,
        },
        sendPush,
      );

      this.logger.log(
        `✅ [createNaskahMasukNotification] SUCCESS! Notification ID: ${result.id}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `❌ [createNaskahMasukNotification] ERROR: ${error.message}`,
      );
      this.logger.error(
        `❌ [createNaskahMasukNotification] Stack: ${error.stack}`,
      );
      throw error;
    }
  }

  /**
   * Create notification for disposisi-specific filters.
   */
  async createDisposisiNotification(
    dto: {
      positionId: string;
      userPersnum?: number;
      naskahId: string;
      sirkulasiId?: string;
      disposisiId?: string;
      nomor?: string;
      perihal: string;
      instruksi?: string;
      pengirim: string;
      pengirimPosition?: string;
      type?: NotificationType.DISPOSISI | NotificationType.DISPOSISI_SELESAI;
      title?: string;
      body?: string;
    },
    sendPush = true,
  ): Promise<NotificationEntity> {
    const type = dto.type || NotificationType.DISPOSISI;
    const isDone = type === NotificationType.DISPOSISI_SELESAI;
    const title =
      dto.title || (isDone ? 'Disposisi selesai' : 'Disposisi masuk');
    const body = dto.body || dto.perihal || dto.instruksi || '-';

    const data: DisposisiNotificationData & Record<string, any> = {
      disposisiId: dto.disposisiId || dto.naskahId,
      naskahId: dto.naskahId,
      instruksi: dto.instruksi || dto.perihal || '-',
      pengirim: dto.pengirim,
      action: 'OPEN_DISPOSISI_DETAIL',
      sirkulasiId: dto.sirkulasiId,
      jenis: 'DI',
      nomor: dto.nomor || null,
      perihal: dto.perihal,
      pengirimPosition: dto.pengirimPosition || dto.pengirim,
    };

    return this.createNotification(
      {
        positionId: dto.positionId,
        userPersnum: dto.userPersnum,
        type,
        title,
        body,
        data,
      },
      sendPush,
    );
  }

  /**
   * Get notifications for a position (paginated)
   */
  async getNotifications(
    positionId: string,
    query: NotificationQueryDto,
  ): Promise<{
    data: NotificationEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, isRead, type } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.position_id = :positionId', { positionId });

    // Jangan pernah tampilkan notifikasi junk (body murni angka / kosong).
    // Backlog lama sebelum sanitizeBody dipasang masih ada di DB.
    queryBuilder.andWhere(
      `(notification.body IS NOT NULL AND TRIM(notification.body) <> '')`,
    );
    queryBuilder.andWhere(`notification.body NOT REGEXP '^[0-9]+$'`);

    if (typeof isRead === 'boolean') {
      queryBuilder.andWhere('notification.is_read = :isRead', { isRead });
    }

    if (type) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    queryBuilder
      .orderBy('notification.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

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
   * Get unread notification count for a position
   *
   * Excludes junk notifications (numeric-only body or empty body).
   * Backlog notifikasi lama sebelum `sanitizeBody` dipasang masih ada di DB
   * dengan body = "12", "23", dll — yang ditampilkan mobile sebagai notif
   * angka murni. Tidak dihitung sebagai unread supaya badge launcher akurat.
   */
  async getUnreadCount(positionId: string): Promise<number> {
    return this.notificationRepository
      .createQueryBuilder('n')
      .where('n.positionId = :positionId', { positionId })
      .andWhere('n.isRead = :isRead', { isRead: false })
      .andWhere(`(n.body IS NOT NULL AND TRIM(n.body) <> '')`)
      .andWhere(`n.body NOT REGEXP '^[0-9]+$'`)
      .getCount();
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(
    positionId: string,
    notificationId: string,
  ): Promise<NotificationEntity> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, positionId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    const saved = await this.notificationRepository.save(notification);

    // Emit realtime
    try {
      this.notificationGateway.emitRead(
        saved.positionId,
        saved.userPersnum,
        saved.id,
      );
      const unread = await this.getUnreadCount(saved.positionId);
      this.notificationGateway.emitUnreadCount(
        saved.positionId,
        saved.userPersnum,
        unread,
      );
    } catch (err: any) {
      this.logger.warn(`⚠️ [markAsRead] WS emit failed: ${err?.message}`);
    }

    return saved;
  }

  /**
   * Mark unread notifications for a naskah as read.
   * Dipakai saat user membuka detail naskah dari kotak masuk, supaya badge
   * notification ikut sinkron walaupun user tidak klik item notification.
   */
  async markByNaskahAsRead(
    positionId: string,
    naskahId: string,
  ): Promise<number> {
    if (!naskahId) return 0;

    const notifications = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.position_id = :positionId', { positionId })
      .andWhere('notification.is_read = :isRead', { isRead: false })
      .andWhere(
        `(
          JSON_UNQUOTE(JSON_EXTRACT(notification.data, '$.naskahId')) = :naskahId
          OR JSON_UNQUOTE(JSON_EXTRACT(notification.data, '$.idNaskah')) = :naskahId
          OR JSON_UNQUOTE(JSON_EXTRACT(notification.data, '$.id_naskah')) = :naskahId
          OR JSON_UNQUOTE(JSON_EXTRACT(notification.data, '$.naskah_id')) = :naskahId
        )`,
        { naskahId },
      )
      .getMany();

    if (notifications.length === 0) return 0;

    const readAt = new Date();
    await this.notificationRepository.update(
      { id: In(notifications.map((notification) => notification.id)) },
      { isRead: true, readAt },
    );

    try {
      for (const notification of notifications) {
        this.notificationGateway.emitRead(
          notification.positionId,
          notification.userPersnum,
          notification.id,
        );
      }
      const unread = await this.getUnreadCount(positionId);
      this.notificationGateway.emitUnreadCount(positionId, null, unread);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [markByNaskahAsRead] WS emit failed: ${err?.message}`,
      );
    }

    return notifications.length;
  }

  /**
   * Mark all notifications as read for a position
   */
  async markAllAsRead(positionId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { positionId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    const affected = result.affected ?? 0;

    // Emit realtime
    try {
      this.notificationGateway.emitReadAll(positionId, null);
      this.notificationGateway.emitUnreadCount(positionId, null, 0);
    } catch (err: any) {
      this.logger.warn(`⚠️ [markAllAsRead] WS emit failed: ${err?.message}`);
    }

    return affected;
  }

  /**
   * Delete a notification
   */
  async deleteNotification(
    positionId: string,
    notificationId: string,
  ): Promise<boolean> {
    const result = await this.notificationRepository.delete({
      id: notificationId,
      positionId,
    });

    const deleted = (result.affected ?? 0) > 0;

    if (deleted) {
      try {
        this.notificationGateway.emitDeleted(positionId, null, notificationId);
        const unread = await this.getUnreadCount(positionId);
        this.notificationGateway.emitUnreadCount(positionId, null, unread);
      } catch (err: any) {
        this.logger.warn(
          `⚠️ [deleteNotification] WS emit failed: ${err?.message}`,
        );
      }
    }

    return deleted;
  }

  /**
   * Delete all notifications for a position
   */
  async clearAllNotifications(
    positionId: string,
    type?: NotificationType,
  ): Promise<number> {
    const criteria: any = { positionId };

    if (type) {
      criteria.type = type;
    }

    const result = await this.notificationRepository.delete(criteria);
    return result.affected ?? 0;
  }

  /**
   * Cleanup terjadwal: hapus notifikasi yang sudah dibaca > 30 hari (tiap hari 03:30).
   * Mencegah tabel notification menumpuk tanpa batas.
   */
  @Cron('30 3 * * *')
  async cleanupOldNotifications(): Promise<void> {
    try {
      const deleted = await this.deleteOldNotifications(30);
      this.logger.log(`🧹 [CRON] Notifikasi lama dihapus: ${deleted}`);
    } catch (error) {
      this.logger.error(
        '❌ [CRON] Gagal cleanup notifikasi:',
        error?.message || error,
      );
    }
  }

  /**
   * Delete old read notifications (cleanup job)
   */
  async deleteOldNotifications(daysOld = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .where('is_read = :isRead', { isRead: true })
      .andWhere('created_at < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Deleted ${result.affected} old notifications`);
    return result.affected ?? 0;
  }

  /**
   * Convert data object to string values for FCM
   */
  private convertDataToString(
    data?: Record<string, any>,
  ): Record<string, string> {
    if (!data) return {};

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }

  /**
   * Get label for jenis naskah
   */
  private getJenisLabel(jenis: string): string {
    const labels: Record<string, string> = {
      ND: 'Nota Dinas',
      SDI: 'Surat Dinas Internal',
      SDE: 'Surat Dinas Eksternal',
      DI: 'Disposisi',
      KA: 'Konsep Arsip',
    };
    return labels[jenis] || jenis;
  }

  /**
   * Sanitasi body notifikasi agar tidak pernah murni angka / kosong.
   * Perihal test sering diisi "12", "23", "111" → notifikasi tampil angka saja.
   * Fallback ke label jenis naskah bila perihal kosong atau murni angka.
   */
  private sanitizeBody(
    perihal: string | undefined | null,
    fallback: string,
  ): string {
    const trimmed = (perihal ?? '').trim();
    if (!trimmed) return fallback;
    if (/^\d+$/.test(trimmed)) return fallback;
    return trimmed;
  }
}
