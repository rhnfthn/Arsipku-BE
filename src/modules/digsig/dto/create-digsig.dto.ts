import {
  IsString,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateDigsigDto {
  @IsString()
  @IsNotEmpty({ message: 'tanggalDokumen tidak boleh kosong' })
  @MaxLength(50, { message: 'tanggalDokumen maksimal 50 karakter' })
  tanggalDokumen: string;
}
