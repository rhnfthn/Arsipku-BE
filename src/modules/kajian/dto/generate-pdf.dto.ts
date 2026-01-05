import { IsString, IsArray, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO untuk Generate PDF Kajian
 * Menerima data dari frontend dan generate PDF dinamis
 * (Struktur sama dengan Nota Dinas)
 */
export class GeneratePdfKajianDto {
  /**
   * HTML content dari rich text editor
   * Bisa dalam bentuk plain text HTML atau base64 encoded
   */
  @IsString()
  htmlContent: string;

  /**
   * Alias untuk tertuju - frontend bisa mengirim sebagai 'penerima'
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima?: string[];

  /**
   * Penerima Kajian (Tertuju)
   * Array dari nama-nama penerima
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value, obj }) => {
    const inputValue = value || obj.penerima;
    if (!inputValue) return undefined;
    if (Array.isArray(inputValue)) return inputValue;
    if (typeof inputValue === 'string') {
      try {
        return JSON.parse(inputValue);
      } catch {
        return [inputValue];
      }
    }
    return inputValue;
  })
  tertuju?: string[];

  /**
   * Pengirim Kajian (Dari)
   */
  @IsString()
  @IsOptional()
  dari?: string;

  /**
   * Abbreviation/BOD Tag pengirim
   */
  @IsString()
  @IsOptional()
  abbreviation?: string;

  /**
   * Perihal/Subjek Kajian
   */
  @IsString()
  @IsOptional()
  perihal?: string;

  /**
   * Tanggal Surat (format: DD/MM/YYYY atau full date string)
   */
  @IsString()
  @IsOptional()
  tanggal?: string;

  /**
   * Tanggal Surat (format: YYYY-MM-DD) - prioritas lebih tinggi dari tanggal
   */
  @IsString()
  @IsOptional()
  tgl?: string;

  /**
   * Nama Tempat untuk format tanggal
   */
  @IsString()
  @IsOptional()
  nama_tempat?: string;

  /**
   * Nama Penandatangan
   */
  @IsString()
  @IsOptional()
  penandatangan?: string;

  /**
   * Nama Lengkap Penandatangan
   */
  @IsString()
  @IsOptional()
  nama_lengkap?: string;

  /**
   * Tembusan Yth
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan?: string[];
}
