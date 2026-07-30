import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsInt,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationTuRole } from '../entities/organization-tu.entity';

export class CreateOrganizationTuDto {
  @ApiProperty({ example: 12345, description: 'persnum user yang diassign' })
  @IsInt()
  @IsNotEmpty()
  persnum: number;

  @ApiProperty({
    enum: OrganizationTuRole,
    example: OrganizationTuRole.UNIT_DOKUMEN,
    description: 'Role dalam Unit TU',
  })
  @IsEnum(OrganizationTuRole)
  role: OrganizationTuRole;

  @ApiPropertyOptional({ description: 'Area code (om_area.area)' })
  @IsOptional()
  @IsString()
  area_id?: string | null;

  @ApiPropertyOptional({
    description: 'Organization code (om_organization.organization)',
  })
  @IsOptional()
  @IsString()
  organization_id?: string | null;

  @ApiPropertyOptional({ description: 'Sub area code (om_area_sub.sub_area)' })
  @IsOptional()
  @IsString()
  sub_area_id?: string | null;

  @ApiProperty({ example: '2026-01-01', description: 'Tanggal mulai berlaku' })
  @IsDateString()
  valid_from: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Tanggal berakhir (opsional)',
  })
  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateOrganizationTuDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  persnum?: number;

  @ApiPropertyOptional({ enum: OrganizationTuRole })
  @IsOptional()
  @IsEnum(OrganizationTuRole)
  role?: OrganizationTuRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  area_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sub_area_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class QueryOrganizationTuDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OrganizationTuRole)
  role?: OrganizationTuRole;

  @IsOptional()
  @IsString()
  area_id?: string;

  @IsOptional()
  @IsString()
  organization_id?: string;

  @IsOptional()
  @IsString()
  sub_area_id?: string;

  @IsOptional()
  @IsString()
  persnum?: string;

  @IsOptional()
  @IsString()
  is_active?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
