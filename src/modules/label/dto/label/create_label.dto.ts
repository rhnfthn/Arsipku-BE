import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @MaxLength(50)
  persnum?: string;

  @IsString()
  @MaxLength(150)
  nama: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  @IsString()
  @IsOptional()
  @MaxLength(36)
  id_parent?: string;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
