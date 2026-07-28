import { IsOptional, IsString, IsInt, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TransferInactiveFileStatus } from '../enums/transfer-status.enum';

/** DTO filter untuk list pemindahan arsip inaktif. */
export class TransferFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(TransferInactiveFileStatus)
  status?: TransferInactiveFileStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}
