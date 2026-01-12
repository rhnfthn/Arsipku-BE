import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsNumber()
  company: number;

  @IsString()
  @MaxLength(50)
  shortText: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  longText?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  uname?: string;
}
