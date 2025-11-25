import { IsString, IsInt, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateDisposisiItemDto {
  @IsString()
  @MaxLength(50)
  company: string;

  @IsString()
  @MaxLength(150)
  nama: string;

  @IsInt()
  urutan: number;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
