import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class OidcCodeExchangeDto {
  @ApiProperty({ description: 'Authorization code dari AirNav Auth' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 4096)
  code: string;

  @ApiProperty({
    description: 'PKCE code_verifier yang dibuat oleh browser',
    minLength: 43,
    maxLength: 128,
  })
  @IsString()
  @Length(43, 128)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  codeVerifier: string;
}
