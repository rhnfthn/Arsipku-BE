import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuditTrailService } from '../services/audit-trail.service';
import { AuditAnomalyService } from '../services/audit-anomaly.service';
import {
  AUDIT_LOG_KEY,
  AuditLogOptions,
} from '../decorators/audit-log.decorator';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditModule } from '../enums/audit-module.enum';
import { AuditStatus } from '../enums/audit-status.enum';
import { CreateAuditTrailDto } from '../dto/create-audit-trail.dto';
import {
  captureAuditErrorWithEventId,
  buildSentryEventUrl,
} from '../../../config/sentry.config';

/**
 * Interceptor untuk auto-logging audit trail.
 *
 * Bekerja dalam 2 mode:
 * 1. Decorator mode: jika method punya @AuditLog(), log dengan opsi spesifik.
 * 2. Auto mode: jika tidak ada decorator, hanya operasi yang mengubah data
 *    (POST/PATCH/PUT/DELETE) dicatat dengan action & module yang di-infer
 *    dari HTTP method dan URL path. GET hanya dicatat jika endpoint secara
 *    eksplisit memakai @AuditLog({ action: VIEW }).
 *
 * Skip endpoint: health check, static files, endpoint audit itu sendiri,
 * polling, health check, static files, dan endpoint audit itu sendiri.
 *
 * Terdaftar sebagai APP_INTERCEPTOR global di AuditModule.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  // Path prefix yang di-skip dari logging
  private readonly skipPrefixes = ['/audit/', '/health', '/auth/refresh'];

  // Path pattern yang di-skip (endpoint yang bukan aksi nyata: preview, generate, dll)
  private readonly skipPathPatterns = [
    /\/preview-pdf$/,
    /\/generate-pdf$/,
    /\/preview$/,
    /\/preview-lampiran$/,
    /\/preview-file\//,
    /\/temp-status\//,
    /\/editor-config\//,
    /\/callback\//,
    /\/storage-document$/,
    /\/me$/,
    /\/inbox-count$/,
    /\/inbox$/,
    /\/sent$/,
    /\/tertunda$/,
    /\/statistics$/,
    /\/bsre-health$/,
    /\/bsre-alert$/,
    /\/my-logs$/,
    /\/my-documents$/,
    /\/pending-signatures$/,
    /\/jenis-naskah$/,
    /\/verifikator$/,
    /\/get-recipient$/,
    /\/get-send-message\//,
    /\/template-schema\//,
    /\/suggestions$/,
    /\/stats$/,
    /\/health$/,
    /\/matrix/,
    /\/roles-batch$/,
    /\/switch-role$/,
    /\/config$/,
    /\/message$/,
    /\/digsig$/,
    /\/user-data$/,
    /\/ktp$/,
    /\/summary$/,
    // Background polling/sinkronisasi UI — bukan aktivitas yang dilakukan user.
    /\/sde-masal\/folders$/,
    /\/sde-masal\/verification-folders$/,
    /\/notifications(?:\/|$)/,
    /\/organization-tu\/check-user(?:\/|$)/,
    /\/admin\/config\/search(?:\/|$)/,
    /\/config\/theme$/,
  ];

  // Mapping prefix URL -> AuditModule (untuk auto-infer module)
  private readonly modulePathMap: { prefix: string; module: AuditModule }[] = [
    { prefix: '/auth', module: AuditModule.AUTH },
    { prefix: '/rbac', module: AuditModule.RBAC },
    { prefix: '/superadmin', module: AuditModule.USER },
    { prefix: '/naskah', module: AuditModule.NASKAH },
    { prefix: '/naskah_sirkulasi', module: AuditModule.NASKAH },
    { prefix: '/naskah-dinas', module: AuditModule.NASKAH },
    { prefix: '/naskah-lainnya', module: AuditModule.NASKAH },
    { prefix: '/persuratan', module: AuditModule.NASKAH },
    { prefix: '/ND', module: AuditModule.NASKAH },
    { prefix: '/NU', module: AuditModule.NASKAH },
    { prefix: '/DI', module: AuditModule.DISPOSISI },
    { prefix: '/SDI', module: AuditModule.NASKAH },
    { prefix: '/SDE', module: AuditModule.NASKAH },
    { prefix: '/KA', module: AuditModule.NASKAH },
    { prefix: '/KONSEP', module: AuditModule.NASKAH },
    { prefix: '/berkas', module: AuditModule.BERKAS },
    { prefix: '/api/arsip', module: AuditModule.BERKAS },
    { prefix: '/arsip-dinamis', module: AuditModule.BERKAS },
    { prefix: '/usulan-akses-berkas', module: AuditModule.BERKAS },
    { prefix: '/penyusutan', module: AuditModule.BERKAS },
    { prefix: '/delegasi', module: AuditModule.DELEGASI },
    { prefix: '/digsig', module: AuditModule.DIGSIG },
    { prefix: '/mail-service', module: AuditModule.MAIL },
    { prefix: '/config', module: AuditModule.CONFIG },
    { prefix: '/admin/config', module: AuditModule.CONFIG },
    { prefix: '/faq', module: AuditModule.FAQ },
    { prefix: '/pedoman', module: AuditModule.FAQ },
    { prefix: '/templates', module: AuditModule.NASKAH },
    { prefix: '/template', module: AuditModule.NASKAH },
    { prefix: '/draft', module: AuditModule.NASKAH },
    { prefix: '/label', module: AuditModule.NASKAH },
    { prefix: '/upload', module: AuditModule.NASKAH },
    { prefix: '/storage', module: AuditModule.NASKAH },
    { prefix: '/jenis', module: AuditModule.MASTER_DATA },
    { prefix: '/klasifikasi', module: AuditModule.MASTER_DATA },
    { prefix: '/grup-penerima', module: AuditModule.MASTER_DATA },
    { prefix: '/short-url', module: AuditModule.NASKAH },
    { prefix: '/naskah-share', module: AuditModule.NASKAH },
    { prefix: '/sde-masal', module: AuditModule.NASKAH },
    { prefix: '/transfer-active-to-inactive', module: AuditModule.USULAN_PINDAH },
    { prefix: '/transfer-inactive-file', module: AuditModule.USULAN_PINDAH },
    { prefix: '/usulan-pindah', module: AuditModule.USULAN_PINDAH },
    { prefix: '/atasan-tu', module: AuditModule.USULAN_PINDAH },
    { prefix: '/tu/', module: AuditModule.USULAN_PINDAH },
    { prefix: '/tugas', module: AuditModule.TUGAS },
    { prefix: '/dashboard', module: AuditModule.NASKAH },
    { prefix: '/company-switch', module: AuditModule.CONFIG },
  ];

  // Mapping prefix URL -> nama tabel di MySQL untuk pre-fetch old data
  private readonly pathTableMap: {
    prefix: string;
    table: string;
    idColumn?: string;
  }[] = [
    { prefix: '/pedoman', table: 'pedoman', idColumn: 'id' },
    { prefix: '/faq', table: 'faq', idColumn: 'id' },
    { prefix: '/faq-kategori', table: 'faq_kategori', idColumn: 'id' },
    { prefix: '/titelatur-en', table: 'titelatur_en', idColumn: 'id' },
    { prefix: '/klasifikasi', table: 'klasifikasi', idColumn: 'id' },
    { prefix: '/jenis', table: 'jenis', idColumn: 'id' },
    { prefix: '/grup-penerima', table: 'grup_penerima', idColumn: 'id' },
    { prefix: '/label', table: 'label', idColumn: 'id' },
    { prefix: '/template', table: 'template', idColumn: 'id' },
    { prefix: '/template-surat', table: 'template_surat', idColumn: 'id' },
    { prefix: '/delegasi', table: 'delegasi', idColumn: 'id' },
    { prefix: '/rbac/roles', table: 'rbac_role', idColumn: 'id' },
    { prefix: '/rbac/resources', table: 'rbac_resource', idColumn: 'id' },
    { prefix: '/rbac/permissions', table: 'rbac_permission', idColumn: 'id' },
    { prefix: '/config/message', table: 'config_message', idColumn: 'id' },
    { prefix: '/config/digsig', table: 'config_digsig', idColumn: 'id' },
  ];

  constructor(
    private readonly reflector: Reflector,
    private readonly auditTrailService: AuditTrailService,
    @Optional() private readonly anomalyService?: AuditAnomalyService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path || request.url || '';
    const method = request.method;

    // Skip endpoint yang tidak perlu di-log
    if (this.shouldSkip(path)) {
      return next.handle();
    }

    // Cek apakah ada @AuditLog() decorator
    const options = this.reflector.getAllAndOverride<
      AuditLogOptions | undefined
    >(AUDIT_LOG_KEY, [context.getHandler(), context.getClass()]);

    // Jangan menganggap setiap GET sebagai aktivitas VIEW. Request GET dari
    // layout, sidebar, badge, polling, dan pemuatan data halaman bukan berarti
    // user membuka halaman tersebut. GET tetap bisa diaudit bila endpoint
    // secara eksplisit memakai @AuditLog({ action: VIEW }).
    const isAutoAuditableMethod = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
    if (!options && !isAutoAuditableMethod) {
      return next.handle();
    }

    // Tentukan opsi log: dari decorator atau auto-infer
    const logOptions: AuditLogOptions = options ?? {
      action: this.inferAction(method, path),
      module: this.inferModule(path),
      // description di-build di logAudit() agar bisa include entity info
    };

    const user = (request as any).user;
    const ip = this.extractIp(request);
    const userAgent = request.get('user-agent') || null;

    // ─── Pre-capture old value untuk UPDATE/DELETE ───────────────────────
    // Query database untuk mendapatkan data lama SEBELUM handler dijalankan.
    // Mapping URL path -\u003e tabel MySQL untuk tahu tabel mana yang di-query.
    const preCapturedOld = await this.preFetchOldData(
      logOptions.action as AuditAction,
      method,
      path,
    );

    return next.handle().pipe(
      tap((response) => {
        // Log sukses secara fire-and-forget
        this.logAudit(
          logOptions,
          user,
          method,
          path,
          ip,
          userAgent,
          AuditStatus.SUCCESS,
          null,
          response,
          preCapturedOld,
          null, // err object — null untuk SUCCESS
        );
      }),
      catchError((err) => {
        // Log gagal/error secara fire-and-forget, lalu re-throw error asli
        const status = this.deriveStatusFromError(err);
        const errorMessage = err?.message || String(err);
        this.logAudit(
          logOptions,
          user,
          method,
          path,
          ip,
          userAgent,
          status,
          errorMessage,
          null,
          preCapturedOld,
          err, // err object — untuk capture ke Sentry & simpan stack trace
        );
        throw err;
      }),
    );
  }

  /**
   * Auto-infer AuditAction dari HTTP method dan path.
   */
  private inferAction(method: string, path: string): AuditAction {
    if (method === 'POST') {
      // Login khusus (termasuk verify-token & SSO callback)
      if (
        path.includes('/auth/login') ||
        path.includes('/auth/sso') ||
        path.includes('/auth/verify-token') ||
        path.includes('/autharsipku')
      )
        return AuditAction.LOGIN;
      if (path.includes('/upload')) return AuditAction.UPLOAD;
      return AuditAction.CREATE;
    }
    if (method === 'PATCH' || method === 'PUT') return AuditAction.UPDATE;
    if (method === 'DELETE') return AuditAction.DELETE;
    return AuditAction.VIEW;
  }

  /**
   * Auto-infer AuditModule dari URL path.
   */
  private inferModule(path: string): AuditModule {
    for (const entry of this.modulePathMap) {
      if (path.startsWith(entry.prefix)) {
        return entry.module;
      }
    }
    return AuditModule.NASKAH; // default fallback
  }

  /**
   * Auto-infer deskripsi dari method dan path.
   */
  private inferDescription(method: string, path: string): string {
    const action = this.inferAction(method, path);
    const mod = this.inferModule(path);
    return `${action} on ${mod} (${method} ${path})`;
  }

  private shouldSkip(path: string): boolean {
    if (!path) return true;
    // Skip prefix
    if (this.skipPrefixes.some((prefix) => path.startsWith(prefix))) {
      return true;
    }
    // Skip pattern (endpoint yang bukan aksi nyata)
    if (this.skipPathPatterns.some((pattern) => pattern.test(path))) {
      return true;
    }
    return false;
  }

  private extractIp(request: Request): string | null {
    // 1. Cek x-forwarded-for (proxy/load balancer)
    const forwarded = request.get('x-forwarded-for');
    if (forwarded) {
      const ip = forwarded.split(',')[0].trim();
      if (ip && ip !== '::1') return ip;
    }
    // 2. Cek x-real-ip (proxy alternatif)
    const realIp = request.get('x-real-ip');
    if (realIp && realIp !== '::1') {
      return realIp.trim();
    }
    // 3. Fallback ke request.ip
    const ip = request.ip || request.socket?.remoteAddress || null;
    if (!ip) return null;
    // Normalisasi IPv6 localhost ::1 -> 127.0.0.1
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
    // Strip IPv6 prefix ::ffff: jika ada
    if (ip.startsWith('::ffff:')) return ip.substring(7);
    return ip;
  }

  private deriveStatusFromError(err: any): AuditStatus {
    const status = err?.status ?? err?.statusCode;
    if (status === 403) return AuditStatus.DENIED;
    if (status === 401) return AuditStatus.FAILED;
    if (status >= 500) return AuditStatus.ERROR;
    if (status >= 400) return AuditStatus.FAILED;
    return AuditStatus.ERROR;
  }

  private logAudit(
    options: AuditLogOptions,
    user: any,
    method: string,
    path: string,
    ip: string | null,
    userAgent: string | null,
    status: AuditStatus,
    errorMessage: string | null,
    response: any,
    preCapturedOld?: any,
    err?: any,
  ) {
    // ─── Capture ke Sentry untuk log FAILED / ERROR ─────────────────────
    // Kirim error ke Sentry dan simpan eventId/issueId di metadata audit
    // agar frontend bisa membangun link langsung ke halaman event Sentry.
    // Jika Sentry tidak aktif (SENTRY_DSN kosong) → sentryInfo = null.
    let sentryInfo: {
      sentryEventId: string;
      sentryIssueId: string | null;
      sentryUrl: string | null;
    } | null = null;
    if (
      err &&
      (status === AuditStatus.FAILED || status === AuditStatus.ERROR)
    ) {
      const captured = captureAuditErrorWithEventId(err, {
        module: options.module,
        method: options.action,
        endpoint: `${method} ${path}`,
        extra: {
          action: options.action,
          module: options.module,
          status,
          errorMessage,
          userId: user?.id ?? user?.userId ?? null,
          persnum: user?.persnum ?? null,
        },
      });
      if (captured) {
        sentryInfo = {
          sentryEventId: captured.eventId,
          sentryIssueId: captured.issueId,
          sentryUrl: buildSentryEventUrl(captured.eventId, captured.issueId),
        };
      }
    }
    // Auto-extract entity ID dari response atau path
    const extractedEntityId = options.entityIdParam
      ? this.extractParam(path, options.entityIdParam)
      : (this.extractEntityIdFromResponse(response) ??
        this.extractEntityIdFromPath(path));

    // Auto-extract entity type dari path
    const extractedEntityType =
      options.entityType ?? this.extractEntityTypeFromPath(path);

    // ─── Aturan oldValue / newValue per aksi (doc/5-audit-trail-old-new-value.md) ─
    // oldValue: hanya untuk UPDATE, DELETE, APPROVE, REJECT, CONFIG_CHANGE
    // newValue: untuk perubahan/login; VIEW/LIST cukup menyimpan metadata agar
    // response daftar atau dokumen tidak disalin ke audit trail.
    const actionsWithOldValue = [
      AuditAction.UPDATE,
      AuditAction.DELETE,
      AuditAction.APPROVE,
      AuditAction.REJECT,
      AuditAction.CONFIG_CHANGE,
    ];
    const shouldCaptureOld =
      options.captureDiff ||
      actionsWithOldValue.includes(options.action as AuditAction);
    const shouldCaptureNew =
      options.captureDiff ||
      ![AuditAction.DELETE, AuditAction.VIEW, AuditAction.LIST].includes(
        options.action as AuditAction,
      );

    // Build newValue berdasarkan aksi
    let extractedNewValue: any = null;
    if (shouldCaptureNew) {
      if (options.action === AuditAction.LOGIN) {
        // Login: info ringkas, bukan full response
        extractedNewValue = {
          timestamp: new Date().toISOString(),
          ipAddress: ip,
          device: this.parseUserAgentString(userAgent),
        };
      } else if (options.action === AuditAction.LOGOUT) {
        extractedNewValue = {
          timestamp: new Date().toISOString(),
        };
      } else {
        extractedNewValue = this.sanitizeResponse(response);
      }
    }

    // oldValue: untuk UPDATE/DELETE/APPROVE/REJECT/CONFIG_CHANGE
    // Prioritas: 1) preCapturedOld (dari request body sebelum handler)
    //            2) options.captureDiff → tryExtractOld (dari response)
    //            3) null
    const extractedOldValue = shouldCaptureOld
      ? (preCapturedOld ??
        (options.captureDiff ? this.tryExtractOld(response) : null))
      : null;

    // ─── Enrich user info dari response jika request.user kosong ──────────
    // Saat login (POST /auth/verify-token, /auth/login, /auth/sso), JWT belum
    // ter-set di request.user, sehingga field user kosong. Ambil dari response
    // body yang berisi data user hasil autentikasi.
    const responseUser = response?.user ?? response?.data?.user ?? null;
    const enrichedUser =
      user ??
      (responseUser
        ? {
            id: responseUser.id ?? responseUser.userId ?? null,
            persnum: responseUser.persnum ?? null,
            nama:
              responseUser.nama ??
              responseUser.name ??
              responseUser.userName ??
              null,
            email: responseUser.email ?? null,
            activeRole: responseUser.activeRole ?? null,
            role: responseUser.role ?? null,
            position: responseUser.position ?? responseUser.idPosition ?? null,
            organization:
              responseUser.organization ?? responseUser.unitKerja ?? null,
          }
        : null);

    const dto: CreateAuditTrailDto = {
      action: options.action,
      module: options.module,
      userId: enrichedUser?.id ?? enrichedUser?.userId ?? null,
      persnum: enrichedUser?.persnum ?? null,
      userName:
        enrichedUser?.nama ??
        enrichedUser?.name ??
        enrichedUser?.userName ??
        null,
      userEmail: enrichedUser?.email ?? null,
      userRole: enrichedUser?.activeRole?.name ?? enrichedUser?.role ?? null,
      idPosition: enrichedUser?.position ?? enrichedUser?.idPosition ?? null,
      unitKerja: enrichedUser?.organization ?? enrichedUser?.unitKerja ?? null,
      entityType: extractedEntityType,
      entityId: extractedEntityId,
      subEntityType: options.subEntityType ?? null,
      subEntityId: this.extractParam(path, options.subEntityIdParam),
      description:
        options.description ??
        this.buildDescription(
          options.action,
          options.module,
          method,
          path,
          extractedEntityType,
          extractedEntityId,
          enrichedUser,
        ),
      oldValue: extractedOldValue,
      newValue: extractedNewValue,
      ipAddress: ip,
      userAgent,
      requestMethod: method,
      requestUrl: path,
      status,
      errorMessage,
      metadata: this.buildMetadataWithSentry(
        options,
        method,
        path,
        response,
        status,
        errorMessage,
        err,
        sentryInfo,
      ),
    };

    // Fire-and-forget insert
    this.auditTrailService.createAsync(dto);

    // Deteksi anomali secara asinkron (jika service tersedia)
    if (this.anomalyService) {
      // Bangun entity minimal untuk detect (id akan di-generate di service)
      Promise.resolve(
        this.anomalyService.detect({
          ...dto,
          createdAt: new Date(),
        } as any),
      ).catch((err) => {
        this.logger.error(`anomaly detect failed: ${err?.message ?? err}`);
      });
    }
  }

  /**
   * Extract entity ID dari response body.
   * Cek field umum: id, data.id, data.naskahId, dll.
   */
  private extractEntityIdFromResponse(response: any): string | null {
    if (!response) return null;
    // Response langsung punya id
    if (response.id && typeof response.id === 'string') return response.id;
    // Response.data punya id
    if (response?.data?.id && typeof response.data.id === 'string')
      return response.data.id;
    // Response.data adalah array, ambil id pertama
    if (
      Array.isArray(response?.data) &&
      response.data.length > 0 &&
      response.data[0]?.id
    ) {
      return response.data[0].id;
    }
    // Response punya naskahId
    if (response?.naskahId) return response.naskahId;
    if (response?.data?.naskahId) return response.data.naskahId;
    return null;
  }

  /**
   * Extract entity ID dari path (segment UUID-like terakhir).
   */
  private extractEntityIdFromPath(path: string): string | null {
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    // Ambil segment terakhir jika terlihat seperti UUID (36 char dengan -)
    const last = segments[segments.length - 1];
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        last,
      )
    ) {
      return last;
    }
    return null;
  }

  /**
   * Extract entity type dari path (segment setelah prefix modul).
   * Mis. /rbac/roles/:id -> roles, /ND/send -> ND
   */
  private extractEntityTypeFromPath(path: string): string | null {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    // Ambil segment pertama sebagai entity type jika hanya 1-2 segment
    if (segments.length <= 2) return segments[0];
    // Ambil segment kedua (setelah prefix modul)
    return segments[1] ?? segments[0];
  }

  /**
   * Build deskripsi yang informatif.
   */
  private buildDescription(
    action: AuditAction | string,
    module: AuditModule | string,
    method: string,
    path: string,
    entityType: string | null,
    entityId: string | null,
    user?: any,
  ): string {
    // Khusus login: tampilkan nama user
    if (action === AuditAction.LOGIN) {
      const userName = user?.nama ?? user?.name ?? user?.userName ?? null;
      const persnum = user?.persnum ?? null;
      const who = userName ?? persnum ?? 'unknown';
      return `Login oleh ${who} pada modul ${module}`;
    }
    const entityPart = entityType ? ` ${entityType}` : '';
    const idPart = entityId ? ` (id: ${entityId.substring(0, 8)}...)` : '';
    return `${action}${entityPart} pada modul ${module}${idPart}`;
  }

  /**
   * Build metadata yang informatif.
   */
  private buildMetadata(
    options: AuditLogOptions,
    method: string,
    path: string,
    response: any,
  ): any {
    const meta: any = {
      action: options.action,
      module: options.module,
      method,
      path,
    };
    // Tambahkan info dari response jika ada (tanpa data sensitif besar)
    if (response?.success !== undefined) meta.success = response.success;
    if (response?.message) meta.responseMessage = response.message;
    return meta;
  }

  /**
   * Build metadata + section error Sentry untuk log FAILED / ERROR.
   *
   * Jika status FAILED/ERROR dan Sentry aktif, metadata akan berisi:
   *   {
   *     ...baseMetadata,
   *     sentryIssueId: "issue-id" | null,
   *     sentryEventId: "event-id",
   *     sentryUrl: "https://sentry.io/organizations/{org}/issues/{issueId}/events/{eventId}/",
   *     errorMessage: "Cannot read property of undefined",
   *     stackTrace: "...",
   *     endpoint: "/audit/logs"
   *   }
   *
   * Untuk SUCCESS / DENIED, section error tidak ditambahkan (metadata biasa).
   */
  private buildMetadataWithSentry(
    options: AuditLogOptions,
    method: string,
    path: string,
    response: any,
    status: AuditStatus,
    errorMessage: string | null,
    err: any,
    sentryInfo: {
      sentryEventId: string;
      sentryIssueId: string | null;
      sentryUrl: string | null;
    } | null,
  ): any {
    const meta = this.buildMetadata(options, method, path, response);

    // Hanya tambahkan section error untuk log FAILED / ERROR
    if (status === AuditStatus.FAILED || status === AuditStatus.ERROR) {
      meta.sentryIssueId = sentryInfo?.sentryIssueId ?? null;
      meta.sentryEventId = sentryInfo?.sentryEventId ?? null;
      meta.sentryUrl = sentryInfo?.sentryUrl ?? null;
      meta.errorMessage = errorMessage;
      meta.stackTrace =
        err instanceof Error ? (err.stack ?? null) : (err?.stack ?? null);
      meta.endpoint = `${method} ${path}`;
    }

    return meta;
  }

  /**
   * Sanitize response untuk new_value — buang field besar/sensitif.
   */
  private sanitizeResponse(response: any): any {
    if (!response) return null;
    const data = response?.data ?? response;
    if (!data || typeof data !== 'object') return null;
    // Clone dangkal, buang field yang mungkin besar/sensitif
    const sanitized: any = { ...data };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'file',
      'content',
      'base64',
      'buffer',
      'stream',
      'pdf',
      'document',
      'lampiran',
    ];
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some((s) => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
      // Truncate string panjang
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + '...[truncated]';
      }
    }
    return sanitized;
  }

  private extractParam(path: string, paramName?: string): string | null {
    if (!paramName) return null;
    // Coba ambil dari path segments (mis. /rbac/roles/:id -> id)
    // Sederhana: cari segment setelah paramName keyword tidak reliable,
    // jadi caller sebaiknya set entityId dari handler langsung jika butuh.
    return null;
  }

  /**
   * Parse User-Agent string menjadi ringkasan browser/OS.
   */
  private parseUserAgentString(userAgent: string | null): string {
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
   * Apakah aksi ini perlu capture old value?
   */
  private shouldCaptureOldValue(action: AuditAction): boolean {
    return [
      AuditAction.UPDATE,
      AuditAction.DELETE,
      AuditAction.APPROVE,
      AuditAction.REJECT,
      AuditAction.CONFIG_CHANGE,
    ].includes(action);
  }

  /**
   * Pre-fetch data lama dari database SEBELUM handler dijalankan.
   * Mapping URL path ke tabel MySQL, lalu query by entity ID dari path.
   * Return null jika tidak bisa di-mapping atau DataSource tidak tersedia.
   */
  private async preFetchOldData(
    action: AuditAction,
    method: string,
    path: string,
  ): Promise<any> {
    if (!this.shouldCaptureOldValue(action)) return null;
    if (!this.dataSource) return null;

    // Cari tabel yang cocok dengan path
    const mapping = this.pathTableMap.find((m) => path.startsWith(m.prefix));
    if (!mapping) return null;

    // Extract entity ID dari path (segment UUID-like terakhir)
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const lastSegment = segments[segments.length - 1];
    // Harus terlihat seperti UUID
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        lastSegment,
      )
    ) {
      return null;
    }

    const idColumn = mapping.idColumn ?? 'id';
    try {
      const rows = await this.dataSource.query(
        `SELECT * FROM \`${mapping.table}\` WHERE \`${idColumn}\` = ? LIMIT 1`,
        [lastSegment],
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return this.sanitizeOldData(rows[0]);
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `preFetchOldData failed for ${mapping.table}: ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Sanitize old data dari DB — buang field sensitif, truncate string panjang.
   */
  private sanitizeOldData(data: any): any {
    if (!data || typeof data !== 'object') return null;
    const sanitized: any = { ...data };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'passphrase',
      'file',
      'content',
      'base64',
      'buffer',
      'stream',
    ];
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some((s) => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + '...[truncated]';
      }
    }
    return sanitized;
  }

  private tryExtractOld(response: any): any {
    // Interceptor hanya punya akses ke response, bukan state sebelumnya.
    // Capture diff old_value idealnya dilakukan di service layer.
    // Di sini kita kembalikan null; service bisa override.
    return null;
  }

  private tryExtractNew(response: any): any {
    if (!response) return null;
    // Ambil data dari response jika ada
    if (response?.data) return response.data;
    return response;
  }
}
