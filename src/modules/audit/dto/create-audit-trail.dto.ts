import { IsEnum, IsOptional, IsString, IsInt, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditModule } from '../enums/audit-module.enum';
import { AuditStatus } from '../enums/audit-status.enum';

/**
 * DTO untuk insert log audit trail.
 * Dipakai oleh AuditTrailService.create / createAsync.
 */
export class CreateAuditTrailDto {
  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  persnum?: number | null;

  @IsOptional()
  @IsString()
  userName?: string | null;

  @IsOptional()
  @IsString()
  userEmail?: string | null;

  @IsOptional()
  @IsString()
  userRole?: string | null;

  @IsOptional()
  @IsString()
  idPosition?: string | null;

  @IsOptional()
  @IsString()
  unitKerja?: string | null;

  @IsEnum(AuditAction)
  action: AuditAction;

  @IsEnum(AuditModule)
  module: AuditModule;

  @IsOptional()
  @IsString()
  entityType?: string | null;

  @IsOptional()
  @IsString()
  entityId?: string | null;

  @IsOptional()
  @IsString()
  subEntityType?: string | null;

  @IsOptional()
  @IsString()
  subEntityId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  oldValue?: any;

  @IsOptional()
  @IsObject()
  newValue?: any;

  @IsOptional()
  @IsString()
  ipAddress?: string | null;

  @IsOptional()
  @IsString()
  userAgent?: string | null;

  @IsOptional()
  @IsString()
  requestMethod?: string | null;

  @IsOptional()
  @IsString()
  requestUrl?: string | null;

  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: any;
}