import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class SendSdeEmailDto {
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_ids?: string[];
}