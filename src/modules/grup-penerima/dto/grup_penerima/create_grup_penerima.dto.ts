import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateGrupPenerimaDto {
  @IsString()
  @MaxLength(50)
  company: string;

  @IsString()
  @MaxLength(150)
  nama: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
