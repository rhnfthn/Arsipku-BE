import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ShortUrlUpdateDto {
  @IsNotEmpty()
  @IsNumber()
  id: number;

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
