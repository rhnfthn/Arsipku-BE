import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AuditAnomaly,
  AuditAnomalyDocument,
} from '../schemas/audit-anomaly.schema';
import { AuditTrail, AuditTrailDocument } from '../schemas/audit-trail.schema';
import { AnomalyFilterDto } from '../dto/anomaly-filter.dto';
import { UpdateAnomalyDto } from '../dto/update-anomaly.dto';
import { AnomalySeverity } from '../enums/anomaly-severity.enum';
import { AnomalyStatus } from '../enums/anomaly-status.enum';
import { AnomalyType } from '../enums/anomaly-type.enum';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditModule } from '../enums/audit-module.enum';
import { AuditStatus } from '../enums/audit-status.enum';
import { captureAuditError } from '../../../config/sentry.config';

/**
 * Service untuk deteksi dan kelola anomali audit.
 *
 * Deteksi anomali berbasis rule sederhana:
 *  - LOGIN_BRUTE_FORCE: >=5 login FAILED dari persnum/IP dalam 10 menit
 *  - ACCESS_DENIED_REPEATED: >=5 status DENIED dari persnum dalam 10 menit
 *  - SENSITIVE_DELETE: DELETE pada module RBAC/CONFIG/MASTER_DATA
 *  - RBAC_CHANGE: CREATE/UPDATE/DELETE pada module RBAC
 *  - MASS_DOWNLOAD: >=10 DOWNLOAD dari persnum dalam 5 menit
 *  - OFF_HOURS_ACCESS: akses di luar jam kerja (sebelum 06:00 atau setelah 20:00 WIB)
 *  - UNAUTHORIZED_STATUS_CHANGE: status DENIED tapi action UPDATE/DELETE/CONFIG_CHANGE
 *
 * Notifikasi superadmin: set flag notification_sent + log.
 * Integrasi penuh ke NotificationService existing bisa di-wire kemudian
 * (butuh mapping positionId superadmin).
 */
@Injectable()
export class AuditAnomalyService {
  private readonly logger = new Logger(AuditAnomalyService.name);

  constructor(
    @InjectModel(AuditAnomaly.name)
    private readonly model: Model<AuditAnomalyDocument>,
    @InjectModel(AuditTrail.name)
    private readonly trailModel: Model<AuditTrailDocument>,
  ) {}

  /**
   * Insert anomali baru.
   */
  async create(data: Partial<AuditAnomaly>): Promise<AuditAnomaly> {
    try {
      const created = new this.model({
        anomalyType: data.anomalyType,
        severity: data.severity,
        title: data.title,
        description: data.description ?? null,
        userId: data.userId ?? null,
        persnum: data.persnum ?? null,
        userName: data.userName ?? null,
        userRole: data.userRole ?? null,
        ipAddress: data.ipAddress ?? null,
        relatedModule: data.relatedModule ?? null,
        relatedEntityType: data.relatedEntityType ?? null,
        relatedEntityId: data.relatedEntityId ?? null,
        evidence: data.evidence ?? null,
        auditTrailId: data.auditTrailId ?? null,
        status: AnomalyStatus.NEW,
      });
      return await created.save();
    } catch (err) {
      this.logger.error(`Failed to create anomaly: ${err.message}`, err.stack);
      // Capture ke Sentry (no-op jika SENTRY_DSN tidak di-set)
      captureAuditError(err, {
        module: 'audit',
        service: 'AuditAnomalyService',
        method: 'create',
        extra: { anomalyType: data.anomalyType },
      });
      throw err;
    }
  }

  /**
   * Evaluasi anomali dari log audit yang masuk.
   * Dipanggil setelah setiap insert audit trail (fire-and-forget).
   */
  async detect(trail: AuditTrail): Promise<void> {
    try {
      await this.detectLoginBruteForce(trail);
      await this.detectAccessDeniedRepeated(trail);
      await this.detectSensitiveDelete(trail);
      await this.detectRbacChange(trail);
      await this.detectMassDownload(trail);
      await this.detectOffHoursAccess(trail);
      await this.detectUnauthorizedStatusChange(trail);
    } catch (err) {
      this.logger.error(`detect() failed: ${err?.message ?? err}`);
      // Capture ke Sentry (no-op jika SENTRY_DSN tidak di-set)
      captureAuditError(err, {
        module: 'audit',
        service: 'AuditAnomalyService',
        method: 'detect',
        extra: {
          auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
        },
      });
    }
  }

  private async detectLoginBruteForce(trail: AuditTrail): Promise<void> {
    if (
      trail.action !== AuditAction.LOGIN ||
      trail.status !== AuditStatus.FAILED
    )
      return;

    const since = new Date(Date.now() - 10 * 60 * 1000); // 10 menit
    const query: any = {
      action: AuditAction.LOGIN,
      status: AuditStatus.FAILED,
      createdAt: { $gt: since },
    };

    if (trail.persnum) {
      query.persnum = trail.persnum;
    } else if (trail.ipAddress) {
      query.ipAddress = trail.ipAddress;
    } else {
      return;
    }

    const count = await this.trailModel.countDocuments(query).exec();
    if (count >= 5) {
      // Cek apakah sudah ada anomali untuk pattern ini dalam 10 menit
      const existingQuery: any = {
        anomalyType: AnomalyType.LOGIN_BRUTE_FORCE,
        createdAt: { $gt: since },
      };
      if (trail.persnum) existingQuery.persnum = trail.persnum;
      else existingQuery.ipAddress = trail.ipAddress;

      const existing = await this.model.findOne(existingQuery).exec();

      if (!existing) {
        await this.create({
          anomalyType: AnomalyType.LOGIN_BRUTE_FORCE,
          severity: AnomalySeverity.HIGH,
          title: `Brute force login terdeteksi (${count}x gagal dalam 10 menit)`,
          description: `Percobaan login gagal berulang terdeteksi${
            trail.userName ? ` untuk user ${trail.userName}` : ''
          }${trail.ipAddress ? ` dari IP ${trail.ipAddress}` : ''}.`,
          userId: trail.userId,
          persnum: trail.persnum,
          userName: trail.userName,
          userRole: trail.userRole,
          ipAddress: trail.ipAddress,
          relatedModule: AuditModule.AUTH,
          auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
          evidence: { count, windowMinutes: 10 },
        });
        this.logger.warn(
          `Anomali LOGIN_BRUTE_FORCE terdeteksi (count=${count})`,
        );
      }
    }
  }

  private async detectAccessDeniedRepeated(trail: AuditTrail): Promise<void> {
    if (trail.status !== AuditStatus.DENIED || !trail.persnum) return;

    const since = new Date(Date.now() - 10 * 60 * 1000);
    const count = await this.trailModel
      .countDocuments({
        status: AuditStatus.DENIED,
        persnum: trail.persnum,
        createdAt: { $gt: since },
      })
      .exec();

    if (count >= 5) {
      const existing = await this.model
        .findOne({
          anomalyType: AnomalyType.ACCESS_DENIED_REPEATED,
          persnum: trail.persnum,
          createdAt: { $gt: since },
        })
        .exec();

      if (!existing) {
        await this.create({
          anomalyType: AnomalyType.ACCESS_DENIED_REPEATED,
          severity: AnomalySeverity.MEDIUM,
          title: `Akses ditolak berulang (${count}x dalam 10 menit)`,
          description: `User ${trail.userName ?? trail.persnum} mencoba mengakses resource tanpa izin berulang kali.`,
          userId: trail.userId,
          persnum: trail.persnum,
          userName: trail.userName,
          userRole: trail.userRole,
          ipAddress: trail.ipAddress,
          relatedModule: trail.module as string,
          auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
          evidence: { count, windowMinutes: 10 },
        });
        this.logger.warn(
          `Anomali ACCESS_DENIED_REPEATED terdeteksi (count=${count})`,
        );
      }
    }
  }

  private async detectSensitiveDelete(trail: AuditTrail): Promise<void> {
    if (trail.action !== AuditAction.DELETE) return;
    const sensitiveModules = [
      AuditModule.RBAC,
      AuditModule.CONFIG,
      AuditModule.MASTER_DATA,
    ];
    if (!sensitiveModules.includes(trail.module as AuditModule)) return;

    await this.create({
      anomalyType: AnomalyType.SENSITIVE_DELETE,
      severity: AnomalySeverity.HIGH,
      title: `Penghapusan data sensitif pada modul ${trail.module}`,
      description: `User ${trail.userName ?? trail.persnum} menghapus data pada modul sensitif ${trail.module}${
        trail.entityType ? ` (${trail.entityType})` : ''
      }.`,
      userId: trail.userId,
      persnum: trail.persnum,
      userName: trail.userName,
      userRole: trail.userRole,
      ipAddress: trail.ipAddress,
      relatedModule: trail.module as string,
      relatedEntityType: trail.entityType,
      relatedEntityId: trail.entityId,
      auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
      evidence: {
        action: trail.action,
        module: trail.module,
        entityId: trail.entityId,
      },
    });
    this.logger.warn(
      `Anomali SENSITIVE_DELETE terdeteksi pada modul ${trail.module}`,
    );
  }

  private async detectRbacChange(trail: AuditTrail): Promise<void> {
    if (trail.module !== AuditModule.RBAC) return;
    const changeActions = [
      AuditAction.CREATE,
      AuditAction.UPDATE,
      AuditAction.DELETE,
    ];
    if (!changeActions.includes(trail.action as AuditAction)) return;

    await this.create({
      anomalyType: AnomalyType.RBAC_CHANGE,
      severity: AnomalySeverity.MEDIUM,
      title: `Perubahan konfigurasi RBAC (${trail.action})`,
      description: `User ${trail.userName ?? trail.persnum} melakukan ${trail.action} pada modul RBAC${
        trail.entityType ? ` (${trail.entityType})` : ''
      }.`,
      userId: trail.userId,
      persnum: trail.persnum,
      userName: trail.userName,
      userRole: trail.userRole,
      ipAddress: trail.ipAddress,
      relatedModule: AuditModule.RBAC,
      relatedEntityType: trail.entityType,
      relatedEntityId: trail.entityId,
      auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
      evidence: {
        action: trail.action,
        module: trail.module,
        entityId: trail.entityId,
      },
    });
    this.logger.warn(`Anomali RBAC_CHANGE terdeteksi (${trail.action})`);
  }

  private async detectMassDownload(trail: AuditTrail): Promise<void> {
    if (trail.action !== AuditAction.DOWNLOAD || !trail.persnum) return;

    const since = new Date(Date.now() - 5 * 60 * 1000); // 5 menit
    const count = await this.trailModel
      .countDocuments({
        action: AuditAction.DOWNLOAD,
        persnum: trail.persnum,
        createdAt: { $gt: since },
      })
      .exec();

    if (count >= 10) {
      const existing = await this.model
        .findOne({
          anomalyType: AnomalyType.MASS_DOWNLOAD,
          persnum: trail.persnum,
          createdAt: { $gt: since },
        })
        .exec();

      if (!existing) {
        await this.create({
          anomalyType: AnomalyType.MASS_DOWNLOAD,
          severity: AnomalySeverity.MEDIUM,
          title: `Mass download terdeteksi (${count}x dalam 5 menit)`,
          description: `User ${trail.userName ?? trail.persnum} melakukan download berjumlah besar dalam waktu singkat.`,
          userId: trail.userId,
          persnum: trail.persnum,
          userName: trail.userName,
          userRole: trail.userRole,
          ipAddress: trail.ipAddress,
          relatedModule: trail.module as string,
          auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
          evidence: { count, windowMinutes: 5 },
        });
        this.logger.warn(`Anomali MASS_DOWNLOAD terdeteksi (count=${count})`);
      }
    }
  }

  private async detectOffHoursAccess(trail: AuditTrail): Promise<void> {
    if (!trail.createdAt) return;
    const hour = new Date(trail.createdAt).getHours();
    // WIB: di luar 06:00 - 20:00
    if (hour >= 6 && hour < 20) return;

    const sensitiveActions = [
      AuditAction.DELETE,
      AuditAction.CONFIG_CHANGE,
      AuditAction.UPDATE,
    ];
    if (!sensitiveActions.includes(trail.action as AuditAction)) return;

    await this.create({
      anomalyType: AnomalyType.OFF_HOURS_ACCESS,
      severity: AnomalySeverity.LOW,
      title: `Akses di luar jam kerja (${hour}:xx WIB)`,
      description: `User ${trail.userName ?? trail.persnum} melakukan aksi sensitif (${trail.action}) di luar jam kerja pada modul ${trail.module}.`,
      userId: trail.userId,
      persnum: trail.persnum,
      userName: trail.userName,
      userRole: trail.userRole,
      ipAddress: trail.ipAddress,
      relatedModule: trail.module as string,
      auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
      evidence: { hour, action: trail.action },
    });
    this.logger.warn(`Anomali OFF_HOURS_ACCESS terdeteksi (hour=${hour})`);
  }

  private async detectUnauthorizedStatusChange(
    trail: AuditTrail,
  ): Promise<void> {
    if (trail.status !== AuditStatus.DENIED) return;
    const changeActions = [
      AuditAction.UPDATE,
      AuditAction.DELETE,
      AuditAction.CONFIG_CHANGE,
    ];
    if (!changeActions.includes(trail.action as AuditAction)) return;

    await this.create({
      anomalyType: AnomalyType.UNAUTHORIZED_STATUS_CHANGE,
      severity: AnomalySeverity.HIGH,
      title: `Upaya perubahan tidak sah (${trail.action})`,
      description: `User ${trail.userName ?? trail.persnum} mencoba ${trail.action} pada modul ${trail.module} namun ditolak.`,
      userId: trail.userId,
      persnum: trail.persnum,
      userName: trail.userName,
      userRole: trail.userRole,
      ipAddress: trail.ipAddress,
      relatedModule: trail.module as string,
      auditTrailId: (trail as any)._id?.toString?.() ?? (trail as any).id,
      evidence: { action: trail.action, status: trail.status },
    });
    this.logger.warn(
      `Anomali UNAUTHORIZED_STATUS_CHANGE terdeteksi (${trail.action})`,
    );
  }

  /**
   * Query anomali dengan filter dan pagination.
   */
  async findAll(filter: AnomalyFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (filter.status) query.status = filter.status;
    if (filter.severity) query.severity = filter.severity;
    if (filter.userId) query.userId = filter.userId;
    if (filter.persnum) query.persnum = filter.persnum;
    if (filter.anomalyType) query.anomalyType = filter.anomalyType;
    if (filter.search) {
      query.$or = [
        { title: { $regex: filter.search, $options: 'i' } },
        { description: { $regex: filter.search, $options: 'i' } },
        { userName: { $regex: filter.search, $options: 'i' } },
      ];
    }

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const allowedSort = ['createdAt', 'severity', 'status', 'userName'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    const sort: any = { [safeSort]: sortOrder === 'ASC' ? 1 : -1 };

    const [data, total] = await Promise.all([
      this.model.find(query).sort(sort).skip(skip).limit(limit).exec(),
      this.model.countDocuments(query).exec(),
    ]);

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
   * Detail satu anomali.
   */
  async findOne(id: string): Promise<AuditAnomaly | null> {
    return this.model.findById(id).exec();
  }

  /**
   * Update status anomali oleh Super Admin.
   */
  async updateStatus(
    id: string,
    dto: UpdateAnomalyDto,
    handledBy?: string | null,
  ) {
    const update: any = {
      status: dto.status,
      handlingNote: dto.handlingNote ?? null,
    };
    if (handledBy) update.handledBy = handledBy;

    if (
      dto.status === AnomalyStatus.RESOLVED ||
      dto.status === AnomalyStatus.IGNORED
    ) {
      update.resolvedAt = new Date();
    }

    return this.model.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  /**
   * Tandai notifikasi anomali sudah terkirim.
   */
  async markAsNotified(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        notificationSent: true,
        notificationSentAt: new Date(),
      })
      .exec();
  }

  /**
   * Trigger notifikasi ke Super Admin.
   *
   * Saat ini hanya set flag + log. Integrasi penuh ke NotificationService
   * existing (butuh mapping positionId superadmin) bisa di-wire kemudian
   * tanpa mengubah kode lama.
   */
  async notifySuperAdmin(anomaly: AuditAnomaly): Promise<void> {
    try {
      this.logger.warn(
        `🔔 Anomali alert untuk Super Admin: [${anomaly.severity}] ${anomaly.title}`,
      );
      // TODO: integrasi ke NotificationService existing (butuh positionId superadmin)
      await this.markAsNotified(
        (anomaly as any)._id?.toString?.() ?? (anomaly as any).id,
      );
    } catch (err) {
      this.logger.error(`notifySuperAdmin failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Notifikasi terbaru untuk Super Admin (anomali status NEW).
   */
  async getRecentNotifications(limit = 10) {
    return this.model
      .find({ status: AnomalyStatus.NEW })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Ringkasan count anomali untuk dashboard.
   */
  async getSummary() {
    const total = await this.model.countDocuments().exec();
    const newCount = await this.model
      .countDocuments({ status: AnomalyStatus.NEW })
      .exec();
    const reviewing = await this.model
      .countDocuments({ status: AnomalyStatus.REVIEWING })
      .exec();
    const resolved = await this.model
      .countDocuments({ status: AnomalyStatus.RESOLVED })
      .exec();
    const ignored = await this.model
      .countDocuments({ status: AnomalyStatus.IGNORED })
      .exec();

    const bySeverityAgg = await this.model
      .aggregate([
        { $match: { status: AnomalyStatus.NEW } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ])
      .exec();

    return {
      total,
      new: newCount,
      reviewing,
      resolved,
      ignored,
      bySeverity: bySeverityAgg.map((r: any) => ({
        severity: r._id,
        count: r.count,
      })),
    };
  }
}
