import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength, IsBoolean } from 'class-validator';

export class CreatePositionDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  @IsOptional()
  company?: number;

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

  @IsBoolean()
  @IsOptional()
  chief?: boolean; // Chief position (managerial)

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
