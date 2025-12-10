import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsUUID,
  MaxLength,
  Matches,
  IsEnum,
} from 'class-validator';
import { Depart } from 'src/common/enums/organization.enum';

export class CreateRelationOdDto {
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
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9 ._\-]+$/, {
    message:
      'organization_text hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  organization_text: string;

  @IsEnum(Depart)
  tipe: Depart;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
