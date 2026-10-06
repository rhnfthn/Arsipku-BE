import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NaskahShareQueryDto {
  @IsOptional()
  @IsEnum(['shared-by-me', 'shared-to-me'])
  tab?: 'shared-by-me' | 'shared-to-me';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(9999)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['AKTIF', 'BERAKHIR'])
  status?: string;

  @IsOptional()
  @IsString()
  jenis?: string;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sort?: 'ASC' | 'DESC';
}
