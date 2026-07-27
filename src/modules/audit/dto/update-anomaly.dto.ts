import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnomalyStatus } from '../enums/anomaly-status.enum';

/**
 * DTO untuk update status anomali oleh Super Admin.
 */
export class UpdateAnomalyDto {
  @IsEnum(AnomalyStatus)
  status: AnomalyStatus;

  @IsOptional()
  @IsString()
  handlingNote?: string | null;
}