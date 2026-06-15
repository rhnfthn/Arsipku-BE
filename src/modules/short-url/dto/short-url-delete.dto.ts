import { IsNotEmpty, IsNumber } from 'class-validator';

export class ShortUrlDeleteDto {
  @IsNotEmpty()
  @IsNumber()
  id: number;
}
