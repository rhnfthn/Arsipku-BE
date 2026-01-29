import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength, IsBoolean } from 'class-validator';

export class CreatePositionDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number; // Required for creating position

  @IsInt()
  position: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @MaxLength(250)
  shortText: string; // Nama Posisi / Position Name

  @IsString()
  @IsOptional()
  @MaxLength(250)
  longText?: string; // Deskripsi Lengkap

  @IsString()
  @IsOptional()
  @MaxLength(250)
  abbreviation?: string; // Titelatur

  // Relation to organization (om_relation_os)
  @IsInt()
  @IsOptional()
  organization?: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  organizationText?: string;

  // BOD tag for cost center relation (om_relation_osc)
  @IsString()
  @IsOptional()
  @MaxLength(50)
  bodTag?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
