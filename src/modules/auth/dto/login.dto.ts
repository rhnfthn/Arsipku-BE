import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Username AirNav',
    example: 'your_username',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    description: 'Password AirNav',
    example: 'your_password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
