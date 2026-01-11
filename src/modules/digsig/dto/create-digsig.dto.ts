import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

/**
 * DTO untuk sign internal (tanpa BSrE)
 * Hanya membutuhkan passphrase
 */
export class SignInternalDto {
  @IsString()
  @IsNotEmpty({ message: 'Passphrase tidak boleh kosong' })
  passphrase: string;
}

/**
 * DTO untuk sign dengan BSrE
 * NIK dan no_wa otomatis diambil dari HR API berdasarkan persnum user yang login
 * User hanya perlu input passphrase
 */
export class SignBsreDto {
  @IsString()
  @IsNotEmpty({ message: 'Passphrase tidak boleh kosong' })
  passphrase: string;

  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Klasifikasi maksimal 50 karakter' })
  klasifikasi?: string;
}
