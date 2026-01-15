import { IsString, IsOptional, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { PositionStatus } from '../../../common/enums/position-status.enum';

export class UpdateDelegasiDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  // Company
  @IsOptional()
  @IsString()
  @MaxLength(50)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company_text?: string;

  // "Sebagai" / As - Position being delegated to
  @IsOptional()
  @IsString()
  @MaxLength(50)
  as_area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_area_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  as_sub_area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_sub_area_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  as_organization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_organization_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  as_position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_position_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  as_persnum?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_name?: string;

  // Position status (role type)
  @IsOptional()
  @IsEnum(PositionStatus)
  position_status?: PositionStatus;

  // Delegator info
  @IsOptional()
  @IsString()
  @MaxLength(50)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  area_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sub_area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  sub_area_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  organization_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  position_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  persnum?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;
}
