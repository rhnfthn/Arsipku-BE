import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TugasMyTaskScope,
  TugasTaskPriority,
  TugasTaskStatus,
  TugasReferenceType,
} from '../enums';
import { IsLocalDate, Trim } from './tugas-validation';

export class CreateTaskDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  judul: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  deskripsi?: string | null;

  @IsOptional()
  @IsEnum(TugasTaskPriority)
  prioritas?: TugasTaskPriority | null;

  @IsOptional()
  @IsLocalDate()
  tenggat?: string | null;

  // Assignment kolaborasi (Phase 3): menunjuk baris membership papan,
  // bukan persnum bebas. Validasi keanggotaan dilakukan di service.
  @IsOptional()
  @IsUUID()
  assigneeMemberId?: string | null;

  // Reference awal (Phase 7 quick create): hanya tipe + ID; label/route
  // dibentuk server via TugasReferenceResolver.
  @IsOptional()
  @IsEnum(TugasReferenceType)
  referenceType?: TugasReferenceType | null;

  @IsOptional()
  @IsUUID()
  referenceId?: string | null;
}

export class UpdateTaskDto {
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  judul?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  deskripsi?: string | null;

  @IsOptional()
  @IsEnum(TugasTaskPriority)
  prioritas?: TugasTaskPriority | null;

  @IsOptional()
  @IsLocalDate()
  tenggat?: string | null;

  // Null eksplisit = unassign; undefined = tidak diubah.
  @IsOptional()
  @IsUUID()
  assigneeMemberId?: string | null;
}

export class MoveTaskDto {
  @IsEnum(TugasTaskStatus)
  status: TugasTaskStatus;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  urutan: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedRevision: number;
}

export class QueryTaskDto {
  @IsOptional()
  @IsEnum(TugasTaskStatus)
  status?: TugasTaskStatus;

  @IsOptional()
  @IsEnum(TugasTaskPriority)
  prioritas?: TugasTaskPriority;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true' ? true : false,
  )
  @IsOptional()
  @IsBoolean()
  includeArchived = false;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class QueryMyTaskDto extends QueryTaskDto {
  @IsOptional()
  @IsEnum(TugasMyTaskScope)
  scope: TugasMyTaskScope = TugasMyTaskScope.SEMUA;

  @IsOptional()
  @IsUUID()
  boardId?: string;
}
