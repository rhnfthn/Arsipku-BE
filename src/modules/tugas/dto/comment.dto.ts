import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from './tugas-validation';

export class CreateTaskCommentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  isi: string;
}

export class QueryTaskCommentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 50;
}