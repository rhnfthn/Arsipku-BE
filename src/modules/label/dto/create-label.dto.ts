import { IsString, IsOptional, IsHexColor, IsInt, Min } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  nama: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsString()
  idParent?: string;

  @IsOptional()
  @IsHexColor()
  warna?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  urutan?: number;
}
