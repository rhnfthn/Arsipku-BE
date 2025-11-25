import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateKlasifikasiDto {
  @IsString()
  @MaxLength(50)
  company: string;

  @IsString()
  @MaxLength(50)
  klasifikasi: string;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
