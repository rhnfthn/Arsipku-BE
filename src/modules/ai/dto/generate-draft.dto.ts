import {
  IsEnum,
  IsString,
  IsOptional,
  MinLength,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum NaskahTypeEnum {
  KAJIAN = 'kajian',
  DISPOSISI = 'disposisi',
  ND = 'ND',
  SDI = 'SDI',
  SDE = 'SDE',
}

export class DraftFieldsDto {
  @IsOptional()
  @IsString()
  tujuan?: string;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  dasar?: string;

  @IsOptional()
  @IsString()
  penerima?: string;
}

export class GenerateDraftDto {
  @IsEnum(NaskahTypeEnum)
  naskahType: NaskahTypeEnum;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(5, { message: 'brief harus minimal 5 karakter' })
  brief: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DraftFieldsDto)
  fields?: DraftFieldsDto;

  @IsOptional()
  @IsString()
  referenceContent?: string;
}
