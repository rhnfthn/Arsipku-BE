import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyTokenDto {
  @ApiProperty({
    description: 'SSO token yang dikirim frontend dari sistem SSO AirNav',
    example: 'ZTE3MTdkN2QyMzE4YmQzYzkyMzc4MmQ2YWEwNjYzYTU0NGYxYzRj...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
