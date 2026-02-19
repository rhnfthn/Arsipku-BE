import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber, Min, Max } from 'class-validator';

/**
 * Tipe sirkuler untuk suggestion
 */
export enum SuggestionTypeEnum {
  /** Pengirim / Tertuju */
  PENGIRIM = 'pengirim',
  /** Penerima / Tembusan */
  PENERIMA = 'penerima',
  /** Semua (pengirim + penerima + tembusan) */
  ALL = 'all',
}

/**
 * DTO untuk request suggestion pengirim/penerima
 */
export class SearchSuggestionDto {
  /**
   * Query pencarian (minimal 3 karakter)
   * Bisa berisi nama orang atau jabatan
   */
  @IsString()
  @MinLength(3, { message: 'Query minimal 3 karakter' })
  q: string;

  /**
   * Tipe sirkuler yang dicari
   * - pengirim: hanya pengirim/tertuju
   * - penerima: hanya penerima/tembusan
   * - all: semua (default)
   */
  @IsOptional()
  @IsEnum(SuggestionTypeEnum)
  type?: SuggestionTypeEnum = SuggestionTypeEnum.ALL;

  /**
   * Jumlah hasil maksimal (default: 10, max: 30)
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(30)
  limit?: number = 10;
}

/**
 * Item suggestion
 */
export class SuggestionItemDto {
  /** Nama sirkuler */
  nama: string;

  /** Jabatan (position text) */
  jabatan: string | null;

  /** Organisasi */
  organization: string | null;

  /** Area */
  area: string | null;

  /** Sub Area */
  subArea: string | null;

  /** Peran-peran orang ini (pengirim / penerima / tembusan) */
  roles: string[];

  /** Position ID untuk dipakai sebagai value */
  position: string | null;
}

/**
 * Response DTO untuk suggestion
 */
export class SearchSuggestionResponseDto {
  success: boolean;
  message: string;
  data: {
    items: SuggestionItemDto[];
    query: string;
    total: number;
  };
}
