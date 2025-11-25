import { IsString, IsOptional, IsDateString, IsInt, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateAreasubDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number;

  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message: 'shortText hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  area?: string;

  @IsInt()
  sub_area: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @MaxLength(50)
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
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
