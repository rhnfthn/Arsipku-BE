import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TuFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

export class VerifikasiBerkasDto {
  @ApiProperty({ description: 'Berkas fisik sesuai atau tidak' })
  @IsBoolean()
  sesuai: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  catatan?: string;
}

export class AjukanAtasanTuDto {
  @ApiProperty({ description: 'Persnum Atasan Managerial TU' })
  @IsString()
  atasanTuPersnum: string;
}

export class KembalikanDto {
  @ApiProperty({ description: 'Alasan pengembalian berkas' })
  @IsString()
  alasan: string;
}
