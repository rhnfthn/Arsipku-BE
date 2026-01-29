import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  @IsOptional()
  company?: number;

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

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
