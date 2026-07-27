import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MessageType } from '../entities';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Judul tidak boleh kosong' })
  @MaxLength(255, { message: 'Judul maksimal 255 karakter' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Pesan tidak boleh kosong' })
  message: string;

  @IsOptional()
  @IsEnum(MessageType, {
    message: 'Type harus berupa info, warning, error, atau success',
  })
  type?: MessageType;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'Show banner harus berupa boolean' })
  show_banner?: boolean;
}

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Judul maksimal 255 karakter' })
  title?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(MessageType, {
    message: 'Type harus berupa info, warning, error, atau success',
  })
  type?: MessageType;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'Show banner harus berupa boolean' })
  show_banner?: boolean;
}

export class ToggleBannerDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'Show banner harus berupa boolean' })
  show_banner?: boolean;
}
