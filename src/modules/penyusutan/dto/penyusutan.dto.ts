import {
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Item atasan untuk multi-select (berjenjang, urutan = index array). */
export class AtasanPenyusutanItemDto {
  @IsInt()
  @Type(() => Number)
  persnum: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  positionId?: number;

  @IsOptional()
  @IsString()
  positionText?: string;
}

/** DTO untuk mengajukan penyusutan (dari halaman Ajukan Penyusutan). */
export class AjukanPenyusutanDto {
  /** ID berkas/arsip yang akan disusutkan. */
  @IsString()
  berkasId: string;

  @IsOptional()
  @IsString()
  kodeBerkas?: string;

  @IsOptional()
  @IsString()
  namaBerkas?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasiText?: string;

  @IsOptional()
  @IsString()
  tanggalRetensiHabis?: string;

  @IsIn(['permanen', 'musnah'])
  jenisPenyusutan: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AtasanPenyusutanItemDto)
  atasanList: AtasanPenyusutanItemDto[];

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsArray()
  daftarArsip?: Array<{ id: string; nama: string; kode: string }>;
}

/** DTO untuk verifikasi (setuju/tolak) oleh atasan managerial. */
export class VerifyPenyusutanDto {
  @IsOptional()
  @IsString()
  catatan?: string;
}

/** DTO untuk penataan arsip permanen. */
export class SimpanPenataanDto {
  @IsString()
  lokasiSimpan: string;

  @IsString()
  beritaAcara: string;

  @IsOptional()
  @IsString()
  fotoDokumentasi?: string;
}

/** DTO untuk pemusnahan arsip. */
export class PemusnahanDto {
  @IsString()
  beritaAcara: string;

  @IsOptional()
  @IsString()
  catatan?: string;
}

/** DTO untuk backup data arsip (jenis musnah). */
export class BackupDataDto {
  @IsOptional()
  @IsString()
  catatan?: string;
}
