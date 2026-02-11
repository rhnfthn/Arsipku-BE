import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NotificationEntity, NotificationType, NaskahMasukNotificationData } from '../entities';
import { CreateNotificationDto, NotificationQueryDto, CreateNaskahMasukNotificationDto } from '../dto';
import { FcmService } from '../../fcm/services';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    private readonly fcmService: FcmService,
  ) {
    this.logger.log('✅ NotificationService initialized');
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
      const notification = this.notificationRepository.create({
        id: uuidv4(),
        positionId: dto.positionId,
        userPersnum: dto.userPersnum || null,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: dto.data || null,
        isRead: false,
      });

      this.logger.log(`📝 [createNotification] Created entity: ${JSON.stringify(notification, null, 2)}`);

      const saved = await this.notificationRepository.save(notification);
      this.logger.log(`✅ [createNotification] SAVED to database! ID: ${saved.id}`);

      // Send push notification if userPersnum is provided
      if (sendPush && dto.userPersnum) {
        this.logger.log(`📤 [createNotification] Sending push notification to persnum: ${dto.userPersnum}`);
        await this.fcmService.sendToUser(
          dto.userPersnum,
          dto.title,
          dto.body,
          this.convertDataToString(dto.data),
        );
        this.logger.log(`✅ [createNotification] Push notification sent`);
      } else {
        this.logger.log(`⏭️ [createNotification] Skip push: sendPush=${sendPush}, userPersnum=${dto.userPersnum}`);
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
      const type = dto.isTembusan ? NotificationType.NASKAH_TEMBUSAN : NotificationType.NASKAH_MASUK;
      const title = `${dto.pengirimPosition}`;
      
      const body = `${dto.perihal}`;

      this.logger.log(`🔔 [createNaskahMasukNotification] jenisLabel: ${jenisLabel}`);
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

      this.logger.log(`🔔 [createNaskahMasukNotification] data: ${JSON.stringify(data, null, 2)}`);

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

      this.logger.log(`✅ [createNaskahMasukNotification] SUCCESS! Notification ID: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ [createNaskahMasukNotification] ERROR: ${error.message}`);
      this.logger.error(`❌ [createNaskahMasukNotification] Stack: ${error.stack}`);
      throw error;
    }
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
   */
  async getUnreadCount(positionId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { positionId, isRead: false },
    });
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

    return this.notificationRepository.save(notification);
  }

  /**
   * Mark all notifications as read for a position
   */
  async markAllAsRead(positionId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { positionId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return result.affected ?? 0;
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

    return (result.affected ?? 0) > 0;
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
  private convertDataToString(data?: Record<string, any>): Record<string, string> {
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
}
