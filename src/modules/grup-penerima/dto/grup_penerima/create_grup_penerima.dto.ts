import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  MaxLength,
} from 'class-validator';
import { GRUP_PENERIMA_JENIS } from '../../entities/grup_penerima.entity';

export class CreateGrupPenerimaDto {
  @IsString()
  @MaxLength(50)
  company: string;

  @IsString()
  @MaxLength(150)
  nama: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  /** Jenis naskah tempat grup ditampilkan; kosong/undefined = semua jenis. */
  @IsOptional()
  @IsArray()
  @IsIn(GRUP_PENERIMA_JENIS, { each: true })
  jenis_naskah?: string[] | null;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
