import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CORRESPONDENCE_DOCUMENT_TYPES } from '../entities/correspondence-access-policy.entity';
import type { CorrespondenceDocumentType } from '../entities/correspondence-access-policy.entity';

export class CorrespondenceAccessListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company?: number;
}

export class UpdateCorrespondenceAccessDto {
  @IsIn(CORRESPONDENCE_DOCUMENT_TYPES)
  document_type: CorrespondenceDocumentType;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  bod_tags: string[];

  @IsArray()
  @ArrayUnique()
  @IsIn([0, 1], { each: true })
  chief_values: number[];

  @IsIn(['ALL', 'SELECTED'])
  area_mode: 'ALL' | 'SELECTED';

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  area_ids: string[];

  @IsBoolean()
  is_active: boolean;
}
