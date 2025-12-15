import { IsString, IsArray, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO untuk Generate PDF Nota Dinas
 * Menerima data dari frontend dan generate PDF dinamis
 */
export class GeneratePdfDto {
  /**
   * HTML content dari rich text editor
   * Bisa dalam bentuk plain text HTML atau base64 encoded
   */
  @IsString()
  htmlContent: string;

  /**
   * Penerima Nota Dinas (Tertuju)
   * Array dari nama-nama penerima
   * Bisa dikirim sebagai JSON string atau langsung array
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
  tertuju?: string[];

  /**
   * Pengirim Nota Dinas (Dari)
   * Bisa berupa full format: "nama (abbreviation) position_text"
   * Atau hanya position_text jika tidak dikirim
   */
  @IsString()
  @IsOptional()
  dari?: string;

  /**
   * Abbreviation/BOD Tag pengirim
   * Akan di-format menjadi bagian dari "Dari"
   */
  @IsString()
  @IsOptional()
  abbreviation?: string;

  /**
   * Perihal/Subjek Nota Dinas
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
   * Nama Penandatangan
   * Nama orang yang menandatangani dokumen
   */
  @IsString()
  @IsOptional()
  penandatangan?: string;

  /**
   * Tembusan Yth
   * Array dari nama-nama penerima tembusan/CC
   * Bisa dikirim sebagai JSON string atau langsung array
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
