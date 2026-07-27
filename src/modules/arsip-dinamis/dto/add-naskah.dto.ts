import { IsArray, IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class AddNaskahToBerkasDto {
  @IsArray()
  @IsNotEmpty({ message: 'Naskah wajib dipilih' })
  naskah_ids: string[];

  @IsString()
  @IsNotEmpty({ message: 'Sumber wajib diisi' })
  @IsEnum(['kotak_masuk', 'terkirim', 'siap_arsip'], {
    message: 'Sumber harus kotak_masuk, terkirim, atau siap_arsip',
  })
  sumber: 'kotak_masuk' | 'terkirim' | 'siap_arsip';
}
