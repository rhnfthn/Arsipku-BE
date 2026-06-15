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
import { Gender } from 'src/common/enums/gender.enum';

export class CreatePersonDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  persnum: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @MaxLength(75)
  @Matches(/^[\p{L}'\. ]+$/u, {
    message:
      'Name hanya boleh berisi huruf, spasi, titik, dan tanda petik satu',
  })
  name: string;

  @IsEnum(Gender)
  gender: Gender;

  // Relation to position (om_relation_sp)
  @IsInt()
  @IsOptional()
  company?: number;

  @IsInt()
  @IsOptional()
  position?: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  positionText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
