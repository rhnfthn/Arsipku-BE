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
   * Alias untuk tertuju - frontend bisa mengirim sebagai 'penerima'
   * Property ini akan di-transform ke 'tertuju'
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
   * ID Grup Penerima (UUID dari tabel grup_penerima)
   * Jika diisi, akan expand semua anggota grup untuk ditampilkan di PDF.
   * Bisa digunakan bersamaan dengan field penerima (akan digabung).
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
  penerima_grup?: string[];

  /**
   * Penerima Nota Dinas (Tertuju)
   * Array dari nama-nama penerima
   * Bisa dikirim sebagai JSON string atau langsung array
   * Frontend bisa mengirim sebagai 'penerima' atau 'tertuju'
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value, obj }) => {
    // Support both 'tertuju' and 'penerima' field names
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
   * Tanggal Surat (format: YYYY-MM-DD) - prioritas lebih tinggi dari tanggal
   */
  @IsString()
  @IsOptional()
  tgl?: string;

  /**
   * Nama Tempat untuk format tanggal (Tangerang, Jakarta, dll)
   */
  @IsString()
  @IsOptional()
  nama_tempat?: string;

  /**
   * Nama Penandatangan
   * Nama orang yang menandatangani dokumen
   */
  @IsString()
  @IsOptional()
  penandatangan?: string;

  /**
   * Nama Lengkap Penandatangan
   * Alternative field for nama penandatangan
   */
  @IsString()
  @IsOptional()
  nama_lengkap?: string;

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

  /**
   * ID Grup Tembusan (UUID dari tabel grup_penerima)
   * Jika diisi, akan expand semua anggota grup untuk tembusan di PDF.
   * Bisa digunakan bersamaan dengan field tembusan (akan digabung).
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
  tembusan_grup?: string[];
}
