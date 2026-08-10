import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditTrail, AuditTrailDocument } from '../schemas/audit-trail.schema';
import { CreateAuditTrailDto } from '../dto/create-audit-trail.dto';
import { AuditFilterDto } from '../dto/audit-filter.dto';
import { AuditStatus } from '../enums/audit-status.enum';
import { captureAuditError } from '../../../config/sentry.config';

/**
 * Service untuk mengelola audit trail log.
 *
 * Menggunakan MongoDB (arsipku_audit) via Mongoose.
 * Semua insert bersifat fire-and-forget (createAsync) agar tidak memperlambat
 * response utama. Tidak ada foreign key ke database utama.
 */
@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(
    // @Optional: MongoDB bisa nonaktif (MONGODB_URI kosong) — model undefined,
    // semua method jadi no-op. Aktifkan kembali via forRootAsync + forFeature.
    @Optional()
    @InjectModel(AuditTrail.name)
    private readonly model?: Model<AuditTrailDocument>,
  ) {}

  /**
   * Insert log audit secara synchronous (menunggu selesai).
   * Hanya dipakai ketika caller benar-benar butuh menunggu hasil.
   */
  async create(data: CreateAuditTrailDto): Promise<AuditTrail | null> {
    if (!this.model) return null; // MongoDB nonaktif — lewati log
    try {
      const created = new this.model({
        userId: data.userId ?? null,
        persnum: data.persnum ?? null,
        userName: data.userName ?? null,
        userEmail: data.userEmail ?? null,
        userRole: data.userRole ?? null,
        idPosition: data.idPosition ?? null,
        unitKerja: data.unitKerja ?? null,
        action: data.action,
        module: data.module,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        subEntityType: data.subEntityType ?? null,
        subEntityId: data.subEntityId ?? null,
        description: data.description ?? null,
        oldValue: data.oldValue ?? null,
        newValue: data.newValue ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        requestMethod: data.requestMethod ?? null,
        requestUrl: data.requestUrl ?? null,
        status: data.status ?? AuditStatus.SUCCESS,
        errorMessage: data.errorMessage ?? null,
        metadata: data.metadata ?? null,
      });
      return await created.save();
    } catch (err) {
      this.logger.error(
        `Failed to create audit log: ${err.message}`,
        err.stack,
      );
      // Capture ke Sentry (no-op jika SENTRY_DSN tidak di-set)
      captureAuditError(err, {
        module: 'audit',
        service: 'AuditTrailService',
        method: 'create',
        extra: { action: data.action, module: data.module },
      });
      throw err;
    }
  }

  /**
   * Insert log audit secara asinkron (fire-and-forget).
   * Tidak blocking response utama. Error hanya di-log.
   */
  createAsync(data: CreateAuditTrailDto): void {
    // Jalankan di background, tangkap error sendiri
    Promise.resolve(this.create(data)).catch((err) => {
      this.logger.error(
        `createAsync failed (fire-and-forget): ${err?.message ?? err}`,
      );
      // Capture ke Sentry (no-op jika SENTRY_DSN tidak di-set)
      captureAuditError(err, {
        module: 'audit',
        service: 'AuditTrailService',
        method: 'createAsync',
        extra: { action: data.action, module: data.module },
      });
    });
  }

  /**
   * Query log dengan filter dan pagination.
   */
  async findAll(filter: AuditFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    if (!this.model) {
      return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }
    const skip = (page - 1) * limit;

    const query: any = {};

    if (filter.startDate) {
      query.createdAt = {
        ...(query.createdAt || {}),
        $gte: new Date(filter.startDate),
      };
    }
    if (filter.endDate) {
      // Append 23:59:59 agar data di hari tersebut masih termasuk
      const end = new Date(`${filter.endDate}T23:59:59`);
      query.createdAt = { ...(query.createdAt || {}), $lte: end };
    }
    if (filter.userId) query.userId = filter.userId;
    if (filter.persnum) query.persnum = filter.persnum;
    if (filter.userRole) query.userRole = filter.userRole;
    if (filter.action) query.action = filter.action;
    if (filter.module) query.module = filter.module;
    if (filter.status) query.status = filter.status;
    if (filter.search) {
      query.$or = [
        { description: { $regex: filter.search, $options: 'i' } },
        { userName: { $regex: filter.search, $options: 'i' } },
        { entityId: { $regex: filter.search, $options: 'i' } },
      ];
    }

    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const allowedSort = [
      'createdAt',
      'userName',
      'userRole',
      'action',
      'module',
      'status',
    ];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    const sort: any = { [safeSort]: sortOrder === 'ASC' ? 1 : -1 };

    const [data, total] = await Promise.all([
      this.model
        .find(query)
        .select(
          '-oldValue -newValue -metadata -requestUrl -errorMessage -userAgent',
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
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
   * Query log aktivitas milik user yang sedang login (Admin / User).
   *
   * Strict filter: user_id = userId OR persnum = persnum.
   * Tidak mengizinkan user melihat log user lain.
   * Tidak menampilkan old_value / new_value / metadata ke response.
   */
  async findMyActivities(
    userId: string | null,
    persnum: number | null,
    filter: import('../dto/my-activity-filter.dto').MyActivityFilterDto,
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    if (!this.model) {
      return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }
    const skip = (page - 1) * limit;

    const query: any = {};

    // Strict: hanya log milik user ini
    if (userId && persnum) {
      query.$or = [{ userId }, { persnum }];
    } else if (userId) {
      query.userId = userId;
    } else if (persnum) {
      query.persnum = persnum;
    } else {
      // Tidak ada identifier → return kosong (tidak boleh lihat apa-apa)
      return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }

    if (filter.fromDate) {
      query.createdAt = {
        ...(query.createdAt || {}),
        $gte: new Date(filter.fromDate),
      };
    }
    if (filter.toDate) {
      const end = new Date(`${filter.toDate}T23:59:59`);
      query.createdAt = { ...(query.createdAt || {}), $lte: end };
    }
    if (filter.action) query.action = filter.action;
    if (filter.module) query.module = filter.module;
    if (filter.status) query.status = filter.status;
    if (filter.search) {
      query.description = { $regex: filter.search, $options: 'i' };
    }

    const [rawData, total] = await Promise.all([
      this.model
        .find(query)
        .select(
          '-oldValue -newValue -metadata -requestUrl -errorMessage -idPosition -unitKerja -userEmail -subEntityType -subEntityId',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    // Strip sensitive fields untuk user biasa + tambahkan field device
    const safeData = rawData.map((d) => ({
      id: (d as any)._id?.toString?.() ?? (d as any).id,
      createdAt: d.createdAt,
      action: d.action,
      module: d.module,
      description: d.description,
      status: d.status,
      ipAddress: d.ipAddress,
      userAgent: d.userAgent,
      device: this.parseDevice(d.userAgent),
      entityType: d.entityType,
      entityId: d.entityId,
    }));

    return {
      data: safeData,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detail satu log.
   */
  async findOne(id: string): Promise<AuditTrail | null> {
    if (!this.model) return null;
    return this.model.findById(id).exec();
  }

  /**
   * Detail satu log untuk Admin/User — hanya jika milik sendiri.
   * Tidak menampilkan field sensitif (oldValue, newValue, metadata, requestUrl, errorMessage).
   */
  async findOneMyActivity(
    id: string,
    userId: string | null,
    persnum: number | null,
  ) {
    if (!this.model) return null;
    const doc = await this.model.findById(id).exec();
    if (!doc) return null;

    // Strict: hanya boleh lihat log milik sendiri
    const isOwner =
      (userId && doc.userId === userId) || (persnum && doc.persnum === persnum);
    if (!isOwner) return null;

    return {
      id: (doc as any)._id?.toString?.() ?? (doc as any).id,
      createdAt: doc.createdAt,
      action: doc.action,
      module: doc.module,
      description: doc.description,
      status: doc.status,
      ipAddress: doc.ipAddress,
      userAgent: doc.userAgent,
      device: this.parseDevice(doc.userAgent),
      entityType: doc.entityType,
      entityId: doc.entityId,
    };
  }

  /**
   * Parse User-Agent string menjadi ringkasan browser/OS.
   */
  private parseDevice(userAgent: string | null): string {
    if (!userAgent) return 'Unknown';
    let browser = 'Unknown';
    let os = 'Unknown';

    if (/edg/i.test(userAgent)) browser = 'Microsoft Edge';
    else if (/chrome|crios/i.test(userAgent)) browser = 'Google Chrome';
    else if (/firefox|fxios/i.test(userAgent)) browser = 'Mozilla Firefox';
    else if (/safari/i.test(userAgent)) browser = 'Safari';

    if (/windows/i.test(userAgent)) os = 'Windows';
    else if (/mac os|macos/i.test(userAgent)) os = 'macOS';
    else if (/android/i.test(userAgent)) os = 'Android';
    else if (/iphone|ipad|ios/i.test(userAgent)) os = 'iOS';
    else if (/linux/i.test(userAgent)) os = 'Linux';

    return `${browser} — ${os}`;
  }

  /**
   * Ringkasan untuk dashboard audit.
   * Mendukung filter: startDate, endDate, action, module, userRole, search.
   */
  async getSummary(
    startDate?: string,
    endDate?: string,
    action?: string,
    module?: string,
    userRole?: string,
    search?: string,
  ) {
    if (!this.model) {
      return {
        total: 0,
        today: 0,
        errorCount: 0,
        lastLogAt: null,
        byStatus: [],
        byAction: [],
        byModule: [],
        daily: [],
        recentLogs: [],
      };
    }
    // Helper: bangun query filter MongoDB
    const buildQuery = (): any => {
      const q: any = {};
      if (startDate)
        q.createdAt = { ...(q.createdAt || {}), $gte: new Date(startDate) };
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59`);
        q.createdAt = { ...(q.createdAt || {}), $lte: end };
      }
      if (action) q.action = action;
      if (module) q.module = module;
      if (userRole) q.userRole = userRole;
      if (search) {
        q.$or = [
          { description: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
          { entityId: { $regex: search, $options: 'i' } },
        ];
      }
      return q;
    };

    const baseQuery = buildQuery();

    // Total count
    const total = await this.model.countDocuments(baseQuery).exec();

    // Count by status
    const byStatusAgg = await this.model
      .aggregate([
        { $match: baseQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();
    const byStatus = byStatusAgg.map((r: any) => ({
      status: r._id,
      count: r.count,
    }));

    // Count by action (top 10)
    const byActionAgg = await this.model
      .aggregate([
        { $match: baseQuery },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .exec();
    const byAction = byActionAgg.map((r: any) => ({
      action: r._id,
      count: r.count,
    }));

    // Count by module (top 10)
    const byModuleAgg = await this.model
      .aggregate([
        { $match: baseQuery },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .exec();
    const byModule = byModuleAgg.map((r: any) => ({
      module: r._id,
      count: r.count,
    }));

    // Aktivitas harian — SELALU 7 hari terakhir, terlepas dari filter startDate/endDate
    const dailyQuery: any = {
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    };
    if (action) dailyQuery.action = action;
    if (module) dailyQuery.module = module;
    if (userRole) dailyQuery.userRole = userRole;
    if (search) {
      dailyQuery.$or = [
        { description: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { entityId: { $regex: search, $options: 'i' } },
      ];
    }

    const dailyAgg = await this.model
      .aggregate([
        { $match: dailyQuery },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    const dailyMap = new Map<string, number>();
    for (const r of dailyAgg) {
      dailyMap.set(r._id, r.count);
    }

    // Generate 7 hari terakhir (selalu, ignore filter startDate/endDate)
    const days: { date: string; count: number }[] = [];
    const loopStart = new Date();
    loopStart.setDate(loopStart.getDate() - 6); // 7 hari termasuk hari ini
    loopStart.setHours(0, 0, 0, 0);

    const cursor = new Date(loopStart);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    while (cursor <= today) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      days.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // 10 log teratas
    const recentLogs = await this.model
      .find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(10)
      .select('id createdAt userName userRole action module description status')
      .exec();

    // ─── Field ringkasan untuk card di halaman Log Aktivitas ─────────────
    // today: jumlah log yang dibuat hari ini (00:00 – 23:59:59 lokal).
    // errorCount: jumlah log dengan status FAILED atau ERROR (sesuai filter).
    // lastLogAt: timestamp log terbaru (createdAt log pertama jika ada).
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayQuery = {
      ...baseQuery,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    };
    const todayCount = await this.model.countDocuments(todayQuery).exec();

    const errorQuery = {
      ...baseQuery,
      status: { $in: ['FAILED', 'ERROR'] },
    };
    const errorCount = await this.model.countDocuments(errorQuery).exec();

    const lastLog = await this.model
      .findOne(baseQuery)
      .sort({ createdAt: -1 })
      .select('createdAt')
      .exec();
    const lastLogAt = lastLog?.createdAt ?? null;

    return {
      total,
      today: todayCount,
      errorCount,
      lastLogAt,
      byStatus,
      byAction,
      byModule,
      daily: days,
      recentLogs,
    };
  }

  /**
   * Aktivitas harian untuk chart (default 7 hari).
   * Endpoint: GET /audit/report/daily-activity
   */
  async getDailyActivity(days = 7) {
    if (!this.model) return [];
    const result: { date: string; count: number }[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      const count = await this.model
        .countDocuments({ createdAt: { $gte: date, $lt: nextDate } })
        .exec();

      const formatted = date
        .toISOString()
        .split('T')[0]
        .split('-')
        .reverse()
        .slice(0, 2)
        .join('/');
      result.push({ date: formatted, count });
    }

    return result;
  }
}
