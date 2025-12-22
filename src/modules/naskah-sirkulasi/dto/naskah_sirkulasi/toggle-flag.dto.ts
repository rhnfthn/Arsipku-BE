import { IsNotEmpty, IsString, IsEnum, IsArray, IsNumber } from 'class-validator';

/**
 * DTO untuk Toggle Flag
 */
export class ToggleFlagDto {
  @IsNotEmpty()
  @IsString()
  id_sirkulasi: string;

  @IsNotEmpty()
  @IsEnum(['favorit', 'note', 'arsip'], {
    message: 'flag_type harus salah satu dari: favorit, note, arsip',
  })
  flag_type: 'favorit' | 'note' | 'arsip';
}

/**
 * Response DTO untuk Toggle Flag
 */
export class ToggleFlagResponseDto {
  success: boolean;
  message: string;
  data: {
    id_sirkulasi: string;
    flag_type: string;
    new_value: boolean;
  } | null;
}

/**
 * DTO untuk Bulk Archive/Delete Sent Messages
 * Digunakan untuk archive atau delete beberapa pesan terkirim sekaligus
 */
export class BulkArchiveSentDto {
  @IsNotEmpty({ message: 'Position ID harus diisi' })
  @IsNumber({}, { message: 'Position ID harus berupa number' })
  position_id: number;

  @IsNotEmpty({ message: 'Daftar ID naskah harus diisi' })
  @IsArray({ message: 'Daftar ID naskah harus berupa array' })
  @IsString({ each: true, message: 'Setiap ID naskah harus berupa string' })
  naskah_ids: string[];

  @IsNotEmpty({ message: 'Action harus diisi' })
  @IsEnum(['archive', 'delete'], {
    message: 'Action harus salah satu dari: archive, delete',
  })
  action: 'archive' | 'delete';
}

/**
 * Response DTO untuk Bulk Archive/Delete
 */
export class BulkArchiveSentResponseDto {
  success: boolean;
  message: string;
  data?: {
    total_requested: number;
    total_processed: number;
    failed_ids: string[];
  };
}
