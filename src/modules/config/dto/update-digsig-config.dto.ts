import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JenisNaskah, TteMode } from '../entities';

export class UpdateDigsigConfigDto {
  @IsEnum(JenisNaskah, {
    message: 'Jenis naskah harus berupa ND, SDI, SDE, DI, KA, atau NL',
  })
  jenis_naskah: JenisNaskah;

  @IsOptional()
  @IsBoolean()
  digsig?: boolean;

  @IsOptional()
  @IsBoolean()
  ttd_qr?: boolean;

  @IsOptional()
  @IsBoolean()
  ttd_basah?: boolean;

  @IsOptional()
  @IsEnum(TteMode, {
    message: 'tte_mode harus bsre_direct atau portal',
  })
  tte_mode?: TteMode;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Deskripsi maksimal 255 karakter' })
  description?: string;
}

export class BulkUpdateDigsigConfigDto {
  configs: UpdateDigsigConfigDto[];
}
