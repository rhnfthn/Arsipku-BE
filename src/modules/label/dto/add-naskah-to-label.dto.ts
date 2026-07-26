import {
  IsString,
  IsArray,
  ArrayMinSize,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class AddNaskahToLabelDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labelIds: string[];

  @IsOptional()
  @IsEnum(['inbox', 'sent', 'draft'], {
    message: 'source harus salah satu dari: inbox, sent, draft',
  })
  @Transform(({ value }) => value ?? 'inbox')
  source?: 'inbox' | 'sent' | 'draft';
}
