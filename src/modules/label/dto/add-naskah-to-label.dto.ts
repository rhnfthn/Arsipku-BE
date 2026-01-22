import { IsString, IsArray, ArrayMinSize, IsEnum, IsOptional } from 'class-validator';

export class AddNaskahToLabelDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labelIds: string[];

  @IsOptional()
  @IsEnum(['inbox', 'sent', 'draft'], {
    message: 'source harus salah satu dari: inbox, sent, draft',
  })
  source?: 'inbox' | 'sent' | 'draft' = 'inbox';
}
