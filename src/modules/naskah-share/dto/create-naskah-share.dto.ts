import { IsString, IsArray, IsOptional, MaxLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateNaskahShareDto {
  @IsString()
  naskahId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  recipientIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  catatan?: string;
}
