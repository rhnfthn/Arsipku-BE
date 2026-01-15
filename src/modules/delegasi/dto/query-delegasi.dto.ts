import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PositionStatus } from '../../../common/enums/position-status.enum';

export class QueryDelegasiDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsEnum(PositionStatus)
  position_status?: PositionStatus;

  @IsOptional()
  @IsString()
  persnum?: string;

  @IsOptional()
  @IsString()
  as_persnum?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  as_position?: string;

  @IsOptional()
  @IsIn(['all', 'aktif', 'tidak_aktif', 'kedaluwarsa'])
  status?: string;

  @IsOptional()
  @IsIn(['terbaru', 'terlama', 'nama_asc', 'nama_desc'])
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
