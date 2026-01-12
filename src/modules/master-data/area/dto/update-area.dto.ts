import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(11)
  area?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  longText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  uname?: string;
}
