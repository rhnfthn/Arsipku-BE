import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { RoutingPosition } from '../services/routing-config-validation';

export class RoutingPreviewPositionDto implements Partial<RoutingPosition> {
  @IsInt()
  @Min(1)
  position: number;

  @IsOptional()
  @IsInt()
  company?: number;

  @IsOptional()
  @IsString()
  position_text?: string;

  @IsOptional()
  @IsInt()
  persnum_person?: number | null;

  @IsOptional()
  @IsInt()
  organization_id?: number;

  @IsOptional()
  @IsString()
  area?: string | null;

  @IsOptional()
  @IsInt()
  sub_area?: number | null;

  [key: string]: unknown;
}

export class RoutingPreviewDto {
  @IsInt()
  @Min(1)
  company: number;

  @IsIn(['DI', 'SDI'])
  documentType: 'DI' | 'SDI';

  @IsIn(['CREATE', 'FORWARD'])
  actionType: 'CREATE' | 'FORWARD';

  @IsInt()
  @Min(1)
  senderPositionId: number;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingPreviewPositionDto)
  structuralRecipients?: RoutingPreviewPositionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingPreviewPositionDto)
  structuralCc?: RoutingPreviewPositionDto[];

  @IsOptional()
  @IsUUID()
  includeInactiveRuleId?: string;
}
