import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditModule } from '../enums/audit-module.enum';

/**
 * Metadata key untuk AuditLog decorator.
 */
export const AUDIT_LOG_KEY = 'audit_log';

/**
 * Opsi untuk AuditLog decorator.
 */
export interface AuditLogOptions {
  /**
   * Modul bisnis terkait aksi ini.
   */
  module: AuditModule;

  /**
   * Jenis aksi audit.
   */
  action: AuditAction;

  /**
   * Apakah perlu capture diff old_value/new_value.
   * Jika true, interceptor akan mencoba capture dari response.
   */
  captureDiff?: boolean;

  /**
   * Deskripsi manual. Jika tidak diisi, akan digenerate dari action + module.
   */
  description?: string;

  /**
   * Entity type manual (mis. 'role', 'user').
   */
  entityType?: string;

  /**
   * Ambil entity id dari parameter request (mis. 'id').
   */
  entityIdParam?: string;

  /**
   * Sub-entity type manual.
   */
  subEntityType?: string;

  /**
   * Ambil sub-entity id dari parameter request.
   */
  subEntityIdParam?: string;
}

/**
 * Decorator untuk menandai controller method agar di-log oleh AuditInterceptor.
 *
 * Contoh:
 * ```typescript
 * @AuditLog({ module: AuditModule.RBAC, action: AuditAction.UPDATE, captureDiff: true })
 * ```
 *
 * Interceptor akan membaca metadata ini dan membuat log audit trail
 * sesuai konfigurasi. Tidak mengubah behavior method asli.
 */
export const AuditLog = (options: AuditLogOptions) =>
  SetMetadata(AUDIT_LOG_KEY, options);