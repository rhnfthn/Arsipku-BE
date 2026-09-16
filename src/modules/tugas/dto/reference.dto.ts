import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TugasReferenceType } from '../enums';
import { Trim } from './tugas-validation';

export class AddTaskReferenceDto {
  // Client hanya mengirim tipe + ID; route/labelSnapshot dibentuk server
  // via TugasReferenceResolver dan TIDAK dipercaya dari luar.
  @IsEnum(TugasReferenceType)
  referenceType: TugasReferenceType;

  @IsUUID()
  referenceId: string;
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
