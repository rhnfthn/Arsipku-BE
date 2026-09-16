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

export class QueryMemberCandidateDto {
  // Wajib minimal 2 karakter agar endpoint tidak menjadi dump directory
  // pegawai (kebijakan Phase 3 kolaborasi).
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}

export class AddBoardMemberDto {
  // Posisi organisasi (bukan persnum bebas) — backend yang me-resolve
  // persnum + snapshot nama/jabatan dari data organisasi.
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  positionId: string;
}

export class QueryActivityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
