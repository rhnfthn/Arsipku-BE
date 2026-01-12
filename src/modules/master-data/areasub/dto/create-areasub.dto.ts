import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class CreateAreasubDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(11)
  area: string;

  @IsNumber()
  sub_area: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsString()
  @MaxLength(50)
  shortText: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  longText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  uname?: string;
}
