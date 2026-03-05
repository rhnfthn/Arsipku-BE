import { IsNotEmpty, IsString } from 'class-validator';

export class ShortUrlLoginDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
