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

      // Bentuk payload push yang kaya informasi (gaya email):
      // title = [Tipe • Jenis] Pengirim (Jabatan)
      // body  = Perihal: ... — Instruksi: ...
      // Ini yang dilihat user di notification panel Android/iOS.
      const display = this.buildDisplayContent(dto);
      const pushTitle = display.title;
      const pushBody = display.body;

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
        // across FCM and WebSocket sources. `type` dipakai mobile untuk
        // menyusun label tipe di system notification (background isolate
        // tidak bisa akses DB / REST).
        const dataWithId = {
          ...(this.convertDataToString(dto.data) || {}),
          type: dto.type,
          notificationId: saved.id,
        };
        await this.fcmService.sendToUser(
          dto.userPersnum,
          pushTitle, // title informatif: [Tipe • Jenis] Pengirim (Jabatan)
          pushBody, // body informatif: Perihal — Instruksi
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

      // Ambil metadata naskah (sifat, klasifikasi, lampiran, tanggal) dari DB
      // supaya notifikasi menampilkan info lengkap tanpa mengubah semua
      // call sites. Field yang tidak ditemukan di-fallback ke dto (jika ada).
      let sifat = dto.sifat || null;
      let klasifikasi = dto.klasifikasi || null;
      let lampiran = dto.lampiran || null;
      let tanggal = dto.tanggal || null;
      try {
        const naskah = await this.dataSource.query(
          `SELECT sifat, klasifikasi_text, lampiran, tanggal
           FROM naskah WHERE id = ? LIMIT 1`,
          [dto.naskahId],
        );
        if (naskah?.[0]) {
          sifat = sifat || naskah[0].sifat || null;
          klasifikasi = klasifikasi || naskah[0].klasifikasi_text || null;
          lampiran = lampiran || naskah[0].lampiran || null;
          tanggal =
            tanggal ||
            (naskah[0].tanggal
              ? new Date(naskah[0].tanggal).toISOString()
              : null);
        }
      } catch (err: any) {
        this.logger.warn(
          `⚠️ [createNaskahMasukNotification] Gagal ambil metadata naskah: ${err?.message}`,
        );
      }

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
        sifat,
        klasifikasi,
        lampiran,
        tanggal,
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
   * Get notifications for a position (paginated).
   *
   * Fallback ke `user_persnum` jika ada: user bisa punya multiple positions
   * atau login dari position berbeda, tapi notifikasi push-nya sudah
   * terkirim ke personal device (`user_persnum`). Tanpa fallback ini,
   * notifikasi seperti DELEGASI (yang disimpan ke `as_position`, bukan
   * position login) tidak akan muncul di list user tsb.
   */
  async getNotifications(
    positionId: string,
    query: NotificationQueryDto,
    userPersnum?: number | null,
  ): Promise<{
    data: NotificationEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, isRead, type } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('(notification.position_id = :positionId', { positionId });
    if (userPersnum != null) {
      queryBuilder.orWhere('notification.user_persnum = :userPersnum', {
        userPersnum,
      });
    }
    queryBuilder.andWhere(
      '1 = 1)', // tutup paren WHERE yang dibuka di atas
    );

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
   * Get unread notification count for a position.
   *
   * Fallback ke `user_persnum` (sama logikanya dengan getNotifications):
   * user bisa login dari position berbeda, tapi push FCM sudah terkirim ke
   * personal device-nya → unread count harus ikut menghitung notif tsb.
   *
   * Excludes junk notifications (numeric-only body or empty body).
   * Backlog notifikasi lama sebelum `sanitizeBody` dipasang masih ada di DB
   * dengan body = "12", "23", dll — yang ditampilkan mobile sebagai notif
   * angka murni. Tidak dihitung sebagai unread supaya badge launcher akurat.
   */
  async getUnreadCount(
    positionId: string,
    userPersnum?: number | null,
  ): Promise<number> {
    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('(n.positionId = :positionId', { positionId });
    if (userPersnum != null) {
      qb.orWhere('n.userPersnum = :userPersnum', { userPersnum });
    }
    qb.andWhere('1 = 1)')
      .andWhere('n.isRead = :isRead', { isRead: false })
      .andWhere(`(n.body IS NOT NULL AND TRIM(n.body) <> '')`)
      .andWhere(`n.body NOT REGEXP '^[0-9]+$'`);
    return qb.getCount();
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
   * Kirim notifikasi test REAL dari persnum pengirim (10010105) ke penerima
   * (10099233). Nama + jabatan pengirim dan jabatan penerima di-resolve dari
   * DB supaya notifikasi tampil sesuai data sebenarnya, lalu disimpan ke DB
   * dan push ke device penerima (bukan data-only ke diri sendiri).
   */
  async sendRealTestNotification(
    type: NotificationType,
    perihal?: string,
    instruksi?: string,
    nomor?: string,
    jenis?: string,
  ): Promise<{ success: boolean; message: string; notificationId?: string }> {
    const SENDER_PERSNUM = 10010105;
    const RECIPIENT_PERSNUM = 10099233;

    // Resolve pengirim (nama + jabatan) dari pa_personal + om_relation_sp.
    const senderRows = await this.dataSource.query(
      `SELECT p.name, rsp.position_text
       FROM pa_personal p
       LEFT JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
       WHERE p.persnum = ? LIMIT 1`,
      [SENDER_PERSNUM],
    );
    const sender = senderRows?.[0];
    const pengirim = sender?.name || String(SENDER_PERSNUM);
    const pengirimPosition = sender?.position_text || '';

    // Resolve jabatan penerima (positionId) dari om_relation_sp.
    const recRows = await this.dataSource.query(
      `SELECT position FROM om_relation_sp WHERE relation_persnum = ? LIMIT 1`,
      [RECIPIENT_PERSNUM],
    );
    const positionId = recRows?.[0]?.position;
    if (!positionId) {
      return {
        success: false,
        message: `Penerima ${RECIPIENT_PERSNUM} tidak punya jabatan aktif`,
      };
    }

    const isDisposisi =
      type === NotificationType.DISPOSISI ||
      type === NotificationType.DISPOSISI_SELESAI;

    const data: Record<string, any> = {
      pengirim,
      pengirimPosition,
      perihal: perihal || 'Notifikasi test',
      jenis: jenis || 'ND',
      nomor: nomor || null,
      action: isDisposisi ? 'OPEN_DISPOSISI_DETAIL' : 'OPEN_INBOX_DETAIL',
    };
    if (instruksi) data.instruksi = instruksi;

    const saved = await this.createNotification({
      positionId: String(positionId),
      userPersnum: RECIPIENT_PERSNUM,
      type,
      title: pengirimPosition || pengirim,
      body: perihal || 'Notifikasi test',
      data,
    });

    return {
      success: true,
      message: `Notifikasi terkirim ke ${RECIPIENT_PERSNUM}`,
      notificationId: saved.id,
    };
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

  /**
   * Susun payload push (title & body) yang kaya informasi dari data payload,
   * sehingga notifikasi yang tampil di notification panel sistem (Android/iOS)
   * maupun di popup in-app mobile menjadi jelas dan lengkap — seperti
   * notifikasi email pada umumnya: jenis, pengirim (nama + jabatan), dan
   * perihal / instruksi.
   *
   * Contoh hasil:
   *  title = "Disposisi Masuk • Nota Dinas — Kepala Kantor"
   *  body  = "Perihal: Rapat Koordinasi\nInstruksi: Mohon ditindaklanjuti"
   */
  private buildDisplayContent(dto: CreateNotificationDto): {
    title: string;
    body: string;
  } {
    const data = (dto.data || {}) as Record<string, any>;
    const typeLabel = this.getTypeLabel(dto.type);
    const jenisLabel = this.getJenisLabel(String(data.jenis ?? ''));
    const senderName = String(data.pengirim ?? '').trim();
    const senderPos = String(data.pengirimPosition ?? '').trim();
    // Pengirim cukup jabatan saja (bukan nama) — sesuai permintaan.
    const sender = senderPos || senderName;

    // Header "Tipe • Jenis" — jenis dilewati bila sudah tersirat di label
    // tipe (mis. "Disposisi Masuk" + jenis DI "Disposisi") supaya tidak double.
    const jenisPart =
      jenisLabel && !typeLabel.toLowerCase().includes(jenisLabel.toLowerCase())
        ? jenisLabel
        : '';
    const header = [typeLabel, jenisPart].filter(Boolean).join(' • ');

    // Title = header + jabatan pengirim (gaya email: dari siapa).
    const title =
      sender && header
        ? `${header} — ${sender}`
        : header || dto.title || 'Notifikasi';

    // Body = perihal + instruksi + nomor. Pengirim sudah di title, jadi
    // tidak diulang dengan baris "Dari:".
    const lines: string[] = [];
    const perihal = String(data.perihal ?? '').trim();
    if (perihal) {
      lines.push(`Perihal: ${perihal}`);
    }
    const instruksi = String(data.instruksi ?? '').trim();
    // Instruksi tidak ditampilkan untuk notif disposisi (cukup perihal).
    const isDisposisi =
      dto.type === NotificationType.DISPOSISI ||
      dto.type === NotificationType.DISPOSISI_SELESAI;
    if (instruksi && !isDisposisi && instruksi !== '-' && instruksi !== perihal) {
      lines.push(`Instruksi: ${instruksi}`);
    }
    const nomor = String(data.nomor ?? '').trim();
    if (nomor) {
      lines.push(`Nomor: ${nomor}`);
    }
    const sifat = String(data.sifat ?? '').trim();
    if (sifat) {
      lines.push(`Sifat: ${this.getSifatLabel(sifat)}`);
    }
    const klasifikasi = String(data.klasifikasi ?? '').trim();
    if (klasifikasi) {
      lines.push(`Klasifikasi: ${klasifikasi}`);
    }
    const lampiran = String(data.lampiran ?? '').trim();
    if (lampiran) {
      lines.push(`Lampiran: ${lampiran}`);
    }
    const tanggal = String(data.tanggal ?? '').trim();
    if (tanggal) {
      lines.push(`Tanggal: ${this.formatTanggal(tanggal)}`);
    }
    // Untuk tipe yang tak punya data payload (delegasi, dll) fallback ke
    // body yang sudah disanitasi agar tidak pernah kosong.
    const body = lines.length > 0 ? lines.join('\n') : dto.body || '';

    return {
      title: this.sanitizeBody(title, header || 'Notifikasi'),
      body: this.sanitizeBody(body, typeLabel),
    };
  }

  /** Label bahasa Indonesia untuk tingkat kerahasiaan (sifat). */
  private getSifatLabel(sifat: string): string {
    const labels: Record<string, string> = {
      sangat_rahasia: 'Sangat Rahasia',
      rahasia: 'Rahasia',
      terbatas: 'Terbatas',
      biasa: 'Biasa',
      terbuka: 'Terbuka',
    };
    return labels[sifat] || sifat;
  }

  /** Format tanggal ISO → dd/mm/yyyy (Indonesia). */
  private formatTanggal(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  /** Label bahasa Indonesia untuk NotificationType. */
  private getTypeLabel(type: NotificationType): string {
    const labels: Partial<Record<NotificationType, string>> = {
      [NotificationType.NASKAH_MASUK]: 'Surat Masuk',
      [NotificationType.NASKAH_TEMBUSAN]: 'Tembusan',
      [NotificationType.DISPOSISI]: 'Disposisi Masuk',
      [NotificationType.DISPOSISI_SELESAI]: 'Disposisi Selesai',
      [NotificationType.KONSEP_DISETUJUI]: 'Konsep Disetujui',
      [NotificationType.KONSEP_DITOLAK]: 'Konsep Ditolak',
      [NotificationType.PENOMORAN_USULAN]: 'Usulan Penomoran',
      [NotificationType.PENOMORAN_PERSETUJUAN]: 'Persetujuan Penomoran',
      [NotificationType.PENOMORAN_VERIFIKASI]: 'Verifikasi Penomoran',
      [NotificationType.PENOMORAN_SELESAI]: 'Penomoran Selesai',
      [NotificationType.PENOMORAN_DITOLAK]: 'Penomoran Ditolak',
      [NotificationType.DIGSIG_VERIFIKASI]: 'Verifikasi Tanda Tangan',
      [NotificationType.DIGSIG_TANDA_TANGAN]: 'Permintaan Tanda Tangan',
      [NotificationType.DIGSIG_SELESAI]: 'Tanda Tangan Selesai',
      [NotificationType.DIGSIG_DITOLAK]: 'Tanda Tangan Ditolak',
      [NotificationType.NASKAH_DINAS_VERIFIKATOR]: 'Verifikator Naskah Dinas',
      [NotificationType.NASKAH_DINAS_VERIFIKASI_SELESAI]:
        'Verifikasi Naskah Selesai',
      [NotificationType.NASKAH_DINAS_DITOLAK]: 'Naskah Ditolak',
      [NotificationType.BERKAS_VERIFIKASI]: 'Verifikasi Berkas',
      [NotificationType.DELEGASI]: 'Delegasi',
      [NotificationType.SYSTEM]: 'Sistem',
      [NotificationType.NASKAH_SHARE_DITERIMA]: 'Naskah Dibagikan',
      [NotificationType.NASKAH_SHARE_DIBUKA]: 'Naskah Dibuka',
      [NotificationType.NASKAH_SHARE_DICABUT]: 'Akses Naskah Dicabut',
    };
    return labels[type] || type;
  }
}
