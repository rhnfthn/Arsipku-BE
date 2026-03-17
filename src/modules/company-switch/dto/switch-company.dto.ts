import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for switch company request
 */
export class SwitchCompanyDto {
  @ApiPropertyOptional({
    description: 'ID dari om_relation_sp yang akan diaktifkan',
    example: 'uuid-relation-sp-001',
  })
  @IsOptional()
  @IsString()
  relationSpId?: string;

  @ApiPropertyOptional({
    description: 'Company ID yang akan diaktifkan',
    example: '2000',
  })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({
    description: 'Position ID yang akan diaktifkan',
    example: '60001234',
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    description: 'Set true untuk kembali ke company default',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  resetToDefault?: boolean;
}

/**
 * DTO for available company response
 */
export class AvailableCompanyDto {
  @ApiProperty({ example: 'uuid-relation-sp-001' })
  relationSpId: string;

  @ApiProperty({ example: 1000 })
  company: number;

  @ApiProperty({ example: 'AirNav Indonesia' })
  companyText: string;

  @ApiProperty({ example: 50001234 })
  position: number;

  @ApiProperty({ example: 'Direktur Operasional' })
  positionText: string;

  @ApiProperty({ example: 'ORG001' })
  organization: string;

  @ApiProperty({ example: 'Direktorat Operasi' })
  organizationText: string;

  @ApiProperty({ example: 'A01' })
  area: string;

  @ApiProperty({ example: 'Pusat' })
  areaText: string;

  @ApiProperty({ example: 'SA001' })
  subArea: string;

  @ApiProperty({ example: 'Kantor Pusat' })
  subAreaText: string;

  @ApiProperty({ example: 'BOD-2' })
  bodTag: string;

  @ApiProperty({ example: '2025-01-01' })
  startDate: string;

  @ApiProperty({ example: '9999-12-31' })
  endDate: string;

  @ApiProperty({ example: true })
  isCurrentCompany: boolean;

  @ApiProperty({ example: false })
  isDefaultCompany: boolean;
}

/**
 * Response DTO for available companies
 */
export class AvailableCompaniesResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [AvailableCompanyDto] })
  companies: AvailableCompanyDto[];

  @ApiProperty({
    example: {
      company: '1000',
      companyText: 'AirNav Indonesia',
      position: '50001234',
      positionText: 'Direktur Operasional',
      bodTag: 'BOD-1',
    },
  })
  currentCompany: {
    company: string;
    companyText: string;
    position: string;
    positionText: string;
    bodTag: string;
  };

  @ApiProperty({ example: 2 })
  total: number;
}

/**
 * Response DTO for switch company
 */
export class SwitchCompanyResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Berhasil switch ke PT Pengadaan AirNav' })
  message: string;

  @ApiProperty({
    example: {
      accessToken: 'eyJhbG...',
      user: {},
      activeCompany: {},
    },
  })
  data: {
    accessToken: string;
    user: any;
    activeCompany?: {
      company: number;
      companyText: string;
      position: number;
      positionText: string;
    };
  };
}
