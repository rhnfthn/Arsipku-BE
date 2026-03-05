import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ShortUrlSubmitDto {
  @IsOptional()
  @IsNumber()
  persnum?: number;

  @IsNotEmpty()
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  keterangan?: string;

  @IsOptional()
  @IsString()
  alias?: string;
}
