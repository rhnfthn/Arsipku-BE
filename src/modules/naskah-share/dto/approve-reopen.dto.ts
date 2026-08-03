import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveReopenDto {
  @IsString()
  @IsIn(['SEKALI_LIHAT', 'RENTANG_WAKTU'])
  accessType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsString()
  catatan?: string;
}
