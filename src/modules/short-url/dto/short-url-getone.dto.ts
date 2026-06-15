import { IsNotEmpty, IsNumber } from 'class-validator';

export class ShortUrlGetOneDto {
  @IsNotEmpty()
  @IsNumber()
  id: number;
}
