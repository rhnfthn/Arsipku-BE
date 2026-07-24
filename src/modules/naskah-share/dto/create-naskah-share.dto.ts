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
  @IsString()
  naskahId: string;

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
