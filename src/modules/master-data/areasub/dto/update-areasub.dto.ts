import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class UpdateAreasubDto {
  @IsOptional()
  @IsString()
  @MaxLength(11)
  area?: string;

  @IsOptional()
  @IsNumber()
  sub_area?: number;

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
