import {
  IsString,
  IsArray,
  IsOptional,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNaskahShareDto {
  // Single naskah (backward compat)
  @IsOptional()
  @IsString()
  naskahId?: string;

  // Multi naskah (baru) — jika diisi, share dibuat untuk setiap naskah
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  naskahIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  recipientIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  catatan?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SEKALI_LIHAT', 'RENTANG_WAKTU'])
  accessType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;
}
