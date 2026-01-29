import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number;

  @IsInt()
  organization: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @MaxLength(250)
  shortText: string; // Nama Unit / Organization Name

  @IsString()
  @IsOptional()
  @MaxLength(250)
  longText?: string; // Deskripsi Lengkap

  @IsString()
  @IsOptional()
  @MaxLength(250)
  abbreviation?: string; // Titelatur

  @IsInt()
  @IsOptional()
  subArea?: number; // Sub area ID (relation_sub_area in om_relation_oa)

  @IsString()
  @IsOptional()
  @MaxLength(200)
  subAreaText?: string; // Sub area text (relation_sub_area_text in om_relation_oa)

  @IsInt()
  @IsOptional()
  parentOrganization?: number; // Parent organization ID (null = top level)

  @IsString()
  @IsOptional()
  @MaxLength(200)
  parentOrganizationText?: string; // Parent organization text

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
