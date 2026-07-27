import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export class CreateTitelaturEnDto {
  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsEnum(['CO', 'PA', 'SA', 'S'])
  object_type?: 'CO' | 'PA' | 'SA' | 'S';

  @IsOptional()
  @IsString()
  long_text?: string;

  @IsOptional()
  @IsString()
  long_text_en?: string;
}
