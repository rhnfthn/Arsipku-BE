import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateOrganizationDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number;

  @IsInt()
  organization: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @MaxLength(250)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'shortText hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  shortText: string;

  @IsString()
  @MaxLength(250)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'longText hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  longText?: string;

  @IsString()
  @MaxLength(250)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'abbreviation hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  abbreviation?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
