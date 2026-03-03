import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ShortUrlDataDto {
  @IsOptional()
  @IsNumber()
  persnum?: number;

  @IsOptional()
  @IsNumber()
  page?: number = 0;

  @IsOptional()
  @IsNumber()
  size?: number = 10;

  @IsOptional()
  @IsString()
  orderby?: string = 'udate';

  @IsOptional()
  @IsString()
  sortby?: string = 'desc';

  @IsOptional()
  @IsString()
  cari?: string = '';
}
