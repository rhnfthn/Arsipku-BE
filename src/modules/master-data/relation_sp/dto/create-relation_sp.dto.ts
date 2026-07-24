import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateRelationSpDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsInt()
  company: number;

  @IsInt()
  relation_persnum: number;

  @IsInt()
  position: number;

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
      'relation_position_text hanya boleh huruf, angka, spasi, titik, dash, dan underscore',
  })
  position_text: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^[\p{L}'\. ]+$/u, {
    message:
      'relation_persnum_text hanya boleh berisi huruf, spasi, titik, dan tanda petik satu',
  })
  relation_persnum_text: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;
}
