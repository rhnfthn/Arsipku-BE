import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  Matches,
  Length,
} from 'class-validator';

/**
 * Base DTO untuk sign dokumen dengan Digsig
 */
export class CreateDigsigDto {
  @IsString()
  @IsNotEmpty({ message: 'NIK tidak boleh kosong' })
  @Length(16, 16, { message: 'NIK harus 16 digit' })
  @Matches(/^\d+$/, { message: 'NIK harus berupa angka' })
  nik: string;

  @IsString()
  @IsNotEmpty({ message: 'Passphrase tidak boleh kosong' })
  passphrase: string;

  @IsString()
  @IsNotEmpty({ message: 'Nomor WhatsApp tidak boleh kosong' })
  @Matches(/^(\+62|62|0)[0-9]{9,12}$/, {
    message: 'Format nomor WhatsApp tidak valid',
  })
  no_wa: string;

  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Klasifikasi maksimal 50 karakter' })
  klasifikasi?: string;
}

/**
 * DTO untuk sign Nota Dinas
 */
export class SignNotaDinasDto extends CreateDigsigDto {}

/**
 * DTO untuk sign Surat Dinas Internal
 */
export class SignSuratDinasInternalDto extends CreateDigsigDto {}

/**
 * DTO untuk sign Surat Dinas Eksternal
 */
export class SignSuratDinasEksternalDto extends CreateDigsigDto {}

/**
 * DTO untuk sign internal (tanpa BSrE)
 * Hanya membutuhkan passphrase
 */
export class SignInternalDto {
  @IsString()
  @IsNotEmpty({ message: 'Passphrase tidak boleh kosong' })
  passphrase: string;
}
