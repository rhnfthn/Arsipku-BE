import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { PositionStatus } from '../../../common/enums/position-status.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDelegasiDto {
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    example: '2026-01-15',
    description: 'REQUIRED: Tanggal mulai delegasi',
  })
  @IsDateString()
  start_date: string;

  @ApiProperty({
    example: '2026-01-31',
    description: 'REQUIRED: Tanggal selesai delegasi',
  })
  @IsDateString()
  end_date: string;

  // Company
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  company_text?: string;

  // "Sebagai" / As - Position being delegated to (REQUIRED)
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  as_area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_area_text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  as_sub_area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_sub_area_text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  as_organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_organization_text?: string;

  @ApiProperty({
    example: 'POS002',
    description: 'REQUIRED: Jabatan yang didelegasikan',
  })
  @IsString()
  @MaxLength(100)
  as_position: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_position_text?: string;

  @ApiPropertyOptional({ example: 'PRS002' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  as_persnum?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  as_name?: string;

  // Position status (role type) - REQUIRED
  @ApiProperty({
    enum: PositionStatus,
    example: 'PT',
    description: 'REQUIRED: Status posisi (PT/PH/PS/VI/SE)',
  })
  @IsEnum(PositionStatus)
  position_status: PositionStatus;

  // Delegator info - akan auto-filled dari JWT
  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  area?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area_text?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sub_area?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  sub_area_text?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  organization_text?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  position_text?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  persnum?: string;

  @ApiPropertyOptional({ description: 'Auto-filled dari JWT token' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;
}
