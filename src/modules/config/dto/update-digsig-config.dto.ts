import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JenisNaskah } from '../entities';

export class UpdateDigsigConfigDto {
  @IsEnum(JenisNaskah, { message: 'Jenis naskah harus berupa ND, SDI, SDE, DI, atau KA' })
  jenis_naskah: JenisNaskah;

  @IsBoolean({ message: 'Enabled harus berupa boolean' })
  enabled: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Deskripsi maksimal 255 karakter' })
  description?: string;
}

export class BulkUpdateDigsigConfigDto {
  configs: UpdateDigsigConfigDto[];
}
