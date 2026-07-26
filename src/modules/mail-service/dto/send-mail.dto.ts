import {
  IsString,
  IsArray,
  IsOptional,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MailLampiranDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  filebase64?: string;
}

export class SendMailDto {
  @IsString()
  @IsNotEmpty()
  subjek!: string;

  @IsString()
  @IsNotEmpty()
  from_as!: string;

  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsString()
  @IsNotEmpty()
  konten!: string;

  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  bcc?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailLampiranDto)
  lampiran?: MailLampiranDto[];
}
