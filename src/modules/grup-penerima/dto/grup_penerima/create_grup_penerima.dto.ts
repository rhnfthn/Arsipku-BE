import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  MaxLength,
} from 'class-validator';
import {
  GRUP_PENERIMA_JENIS,
  GRUP_PENERIMA_TUJUAN,
} from '../../entities/grup_penerima.entity';
import type { GrupPenerimaTujuan } from '../../entities/grup_penerima.entity';

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

  @IsOptional()
  @IsArray()
  @IsIn(GRUP_PENERIMA_TUJUAN, { each: true })
  tujuan?: GrupPenerimaTujuan[] | null;

  @IsBoolean()
  @IsOptional()
  lintas_area?: boolean = true;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}

export class UpdateGrupPenerimaUsageDto {
  @IsOptional()
  @IsArray()
  @IsIn(GRUP_PENERIMA_TUJUAN, { each: true })
  tujuan?: GrupPenerimaTujuan[] | null;

  @IsBoolean()
  lintas_area: boolean;
}
