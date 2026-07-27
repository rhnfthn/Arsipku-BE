import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AnomalySeverity } from '../enums/anomaly-severity.enum';
import { AnomalyStatus } from '../enums/anomaly-status.enum';

/**
 * DTO filter untuk query anomali audit.
 */
export class AnomalyFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(AnomalyStatus)
  status?: AnomalyStatus;

  @IsOptional()
  @IsEnum(AnomalySeverity)
  severity?: AnomalySeverity;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  persnum?: number;

  @IsOptional()
  @IsString()
  anomalyType?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}