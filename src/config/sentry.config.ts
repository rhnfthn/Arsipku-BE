import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

/**
 * Inisialisasi Sentry untuk backend Arsipku.
 *
 * Sentry HANYA aktif jika environment variable SENTRY_DSN di-set.
 * Jika SENTRY_DSN kosong / tidak ada, fungsi ini no-op (tidak melakukan
 * apa-apa) sehingga aplikasi tetap jalan normal tanpa Sentry.
 *
 * Konfigurasi:
 *  - DSN dibaca dari process.env.SENTRY_DSN
 *  - Environment dari process.env.NODE_ENV (default: 'development')
 *  - tracesSampleRate dari process.env.SENTRY_TRACES_SAMPLE_RATE (default: 1.0)
 *  - profilesSampleRate dari process.env.SENTRY_PROFILES_SAMPLE_RATE (default: 1.0)
 *
 * Integrasi yang diaktifkan:
 *  - httpIntegration() — tangkap error HTTP & tracing request
 *  - nodeProfilingIntegration() — profiling performa Node.js
 *
 * Keamanan:
 *  - Jangan kirim password / token / data sensitif ke Sentry.
 *  - beforeSend scrub field sensitif dari extra/tags sebelum dikirim.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Sentry tidak dikonfigurasi → skip inisialisasi (no-op)
    // eslint-disable-next-line no-console
    console.log('[Sentry] SENTRY_DSN not set — Sentry disabled (no-op).');
    return;
  }

  const environment = process.env.NODE_ENV || 'development';
  const tracesSampleRate = parseFloat(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? '1.0',
  );
  const profilesSampleRate = parseFloat(
    process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '1.0',
  );

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: Number.isNaN(tracesSampleRate) ? 1.0 : tracesSampleRate,
    profilesSampleRate: Number.isNaN(profilesSampleRate)
      ? 1.0
      : profilesSampleRate,
    integrations: [Sentry.httpIntegration(), nodeProfilingIntegration()],
    // Scrub field sensitif sebelum event dikirim ke Sentry
    beforeSend(event: any): any {
      return scrubSentryEvent(event);
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[Sentry] Initialized (env=${environment}).`);
}

/**
 * Scrub field sensitif dari Sentry event sebelum dikirim.
 *
 * Menghapus / mask nilai dari key yang kemungkinan mengandung
 * password, token, secret, authorization header, dll.
 */
function scrubSentryEvent(event: any): any {
  const sensitiveKeys = [
    'password',
    'passwd',
    'secret',
    'token',
    'authorization',
    'auth',
    'jwt',
    'apikey',
    'api_key',
    'privatekey',
    'private_key',
    'firebase',
    'aws_secret',
    'aws_access_key',
  ];

  const scrubValue = (val: unknown): unknown => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') return '[REDACTED]';
    if (typeof val === 'object')
      return scrubObject(val as Record<string, unknown>);
    return val;
  };

  const scrubObject = (
    obj: Record<string, unknown>,
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        result[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        result[key] = scrubObject(obj[key] as Record<string, unknown>);
      } else {
        result[key] = obj[key];
      }
    }
    return result;
  };

  // Scrub request headers
  if (event.request?.headers) {
    event.request.headers = scrubObject(
      event.request.headers as Record<string, unknown>,
    ) as Record<string, string>;
  }

  // Scrub extra data
  if (event.extra) {
    event.extra = scrubObject(event.extra as Record<string, unknown>);
  }

  // Scrub contexts
  if (event.contexts) {
    event.contexts = scrubObject(
      event.contexts as Record<string, unknown>,
    ) as Record<string, any>;
  }

  return event;
}

/**
 * Helper untuk capture exception dengan tag module audit.
 *
 * Dipakai oleh service / controller audit trail agar konsisten tag-nya.
 * Jika Sentry tidak aktif, fungsi ini no-op (aman dipanggil kapan saja).
 */
export function captureAuditError(
  error: unknown,
  context: {
    module?: string;
    service?: string;
    method?: string;
    controller?: string;
    endpoint?: string;
    extra?: Record<string, unknown>;
  } = {},
): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // Sentry tidak aktif → no-op

  Sentry.captureException(error, {
    tags: {
      module: context.module ?? 'audit',
      ...(context.service ? { service: context.service } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(context.controller ? { controller: context.controller } : {}),
      ...(context.endpoint ? { endpoint: context.endpoint } : {}),
    },
    extra: context.extra,
  });
}

/**
 * Capture exception ke Sentry dan kembalikan eventId + (opsional) issueId.
 *
 * Berbeda dengan `captureAuditError`, fungsi ini mengembalikan identifier
 * event Sentry sehingga caller (mis. AuditInterceptor) bisa menyimpannya di
 * metadata audit log. Dengan ID tersebut, frontend dapat membangun link
 * langsung ke halaman event di Sentry dashboard.
 *
 * Catatan:
 *  - Sentry SDK Node.js tidak mengembalikan issueId secara synchronous
 *    (issue grouping terjadi server-side). Yang bisa diambil langsung adalah
 *    `eventId`. IssueId bisa di-resolve via Sentry API terpisah jika perlu.
 *  - Jika Sentry tidak aktif (SENTRY_DSN kosong), fungsi mengembalikan
 *    `null` sehingga caller tahu tidak ada event yang tercatat.
 *
 * @returns `{ eventId, issueId } | null` — null jika Sentry tidak aktif.
 */
export function captureAuditErrorWithEventId(
  error: unknown,
  context: {
    module?: string;
    service?: string;
    method?: string;
    controller?: string;
    endpoint?: string;
    extra?: Record<string, unknown>;
  } = {},
): { eventId: string; issueId: string | null } | null {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null; // Sentry tidak aktif → no-op

  const eventId = Sentry.captureException(error, {
    tags: {
      module: context.module ?? 'audit',
      ...(context.service ? { service: context.service } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(context.controller ? { controller: context.controller } : {}),
      ...(context.endpoint ? { endpoint: context.endpoint } : {}),
    },
    extra: context.extra,
  });

  // issueId tidak tersedia secara synchronous di SDK Node — biarkan null.
  // Bisa di-enrich kemudian via Sentry REST API jika dibutuhkan.
  return eventId ? { eventId, issueId: null } : null;
}

/**
 * Bangun URL ke halaman event Sentry berdasarkan eventId (dan issueId opsional).
 *
 * Format: https://sentry.io/organizations/{org}/issues/{issueId}/events/{eventId}/
 * Jika issueId tidak diketahui, gunakan bentuk pencarian event:
 *   https://sentry.io/organizations/{org}/search/?query=...&statsPeriod=
 * atau fallback ke halaman issues project:
 *   https://sentry.io/organizations/{org}/projects/{project}/
 *
 * Jika SENTRY_ORG tidak dikonfigurasi, kembalikan null (frontend tidak
 * menampilkan tombol "Lihat Detail di Sentry").
 */
export function buildSentryEventUrl(
  eventId: string,
  issueId?: string | null,
): string | null {
  const org = process.env.SENTRY_ORG;
  if (!org) return null;

  const base = `https://sentry.io/organizations/${org}`;
  if (issueId) {
    return `${base}/issues/${issueId}/events/${eventId}/`;
  }
  // Fallback: halaman issues project (event tetap bisa dicari via eventId)
  const project = process.env.SENTRY_PROJECT_SLUG;
  if (project) {
    return `${base}/projects/${project}/`;
  }
  return `${base}/issues/`;
}

/**
 * Set user context di Sentry untuk identifikasi user saat error.
 *
 * Jika Sentry tidak aktif, fungsi ini no-op.
 */
export function setSentryUser(user: {
  id?: string | number | null;
  persnum?: string | number | null;
  username?: string | null;
  role?: string | null;
}): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // Sentry tidak aktif → no-op

  Sentry.setUser({
    ...(user.id != null ? { id: String(user.id) } : {}),
    ...(user.persnum != null ? { persnum: String(user.persnum) } : {}),
    ...(user.username ? { username: user.username } : {}),
    ...(user.role ? { role: user.role } : {}),
  });
}

/**
 * Clear user context di Sentry (mis. saat logout).
 */
export function clearSentryUser(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.setUser(null);
}
