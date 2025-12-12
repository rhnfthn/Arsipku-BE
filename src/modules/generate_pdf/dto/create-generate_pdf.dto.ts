import { IsNotEmpty, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateGeneratePdfDto {
  @IsString()
  @IsNotEmpty()
  html: string;

  @IsString()
  @IsOptional()
  filename?: string = 'document.pdf';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  penerima: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tembusan?: string[];

  @IsString()
  @IsOptional()
  perihal: string;

  @IsString()
  @IsOptional()
  sifat: string;

  @IsString()
  @IsOptional()
  tgl: string;
}
