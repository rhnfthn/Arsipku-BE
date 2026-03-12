import { IsString, IsOptional } from 'class-validator';

export class UpdateFaqKategoriDto {
  @IsString()
  @IsOptional()
  nama?: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;
}
