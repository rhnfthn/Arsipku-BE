import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendShareEmailDto {
  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  bcc?: string;

  @IsOptional()
  @IsString()
  from_as?: string;
}
