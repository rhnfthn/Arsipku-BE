import { IsNotEmpty, IsString, IsEnum } from 'class-validator';

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
