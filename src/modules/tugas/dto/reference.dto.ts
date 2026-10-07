import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TugasReferenceType } from '../enums';
import { Trim } from './tugas-validation';

export class AddTaskReferenceDto {
  // Client mengirim tipe + salah satu ID/nomor. Route, label, dan ID kanonis
  // tetap dibentuk server via TugasReferenceResolver dan tidak dipercaya dari luar.
  @IsEnum(TugasReferenceType)
  referenceType: TugasReferenceType;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  referenceNumber?: string;
}

export class CreateTaskWithReferenceDto {
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
  @IsEnum(TugasReferenceType)
  referenceType?: TugasReferenceType | null;

  @IsOptional()
  @IsUUID()
  referenceId?: string | null;
}

export class QueryReferenceCandidateDto {
  @IsIn(['inbox', 'sent'])
  source: 'inbox' | 'sent' = 'inbox';

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q: string = '';
}
