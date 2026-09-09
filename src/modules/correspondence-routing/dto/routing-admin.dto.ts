import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OmitType, PartialType } from '@nestjs/mapped-types';

export class RoutingListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) company?: number;
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) is_active?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class CreateRoutingRoleDto {
  @IsInt() @Min(1) company: number;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,63}$/) code: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

export class UpdateRoutingRoleDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

export class RoutingToggleDto {
  @IsBoolean() is_active: boolean;
}

export class RoutingMemberDto {
  @IsInt() @Min(1) position_id: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) valid_from: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) valid_to?:
    | string
    | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class RoutingMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RoutingMemberDto)
  members: RoutingMemberDto[];
}

export class UpdateRoutingMemberDto extends PartialType(RoutingMemberDto) {}

export class RoutingScopeDto {
  @IsIn(['SOURCE', 'TARGET']) side: 'SOURCE' | 'TARGET';
  @IsIn(['AREA', 'SUB_AREA', 'ORGANIZATION', 'POSITION']) entity_type:
    | 'AREA'
    | 'SUB_AREA'
    | 'ORGANIZATION'
    | 'POSITION';
  @IsString() @IsNotEmpty() @MaxLength(100) entity_id: string;
  @IsBoolean() include_flag: boolean;
}

export class CreateRoutingRuleDto {
  @IsInt() @Min(1) company: number;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,99}$/) code: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsIn(['DI', 'SDI']) document_type: 'DI' | 'SDI';
  @IsIn(['CREATE', 'FORWARD', 'BOTH']) action_type:
    | 'CREATE'
    | 'FORWARD'
    | 'BOTH';
  @IsUUID() source_role_id: string;
  @IsUUID() target_role_id: string;
  @IsIn(['PENERIMA', 'TEMBUSAN']) delivery_type: 'PENERIMA' | 'TEMBUSAN';
  @IsIn(['ALLOW_SELECT', 'AUTO_INCLUDE']) effect:
    | 'ALLOW_SELECT'
    | 'AUTO_INCLUDE';
  @IsIn(['ALL', 'SAME_AREA', 'SAME_SUB_AREA', 'EXPLICIT']) scope_type:
    | 'ALL'
    | 'SAME_AREA'
    | 'SAME_SUB_AREA'
    | 'EXPLICIT';
  @IsIn(['ADD']) behavior: 'ADD';
  @IsBoolean() mandatory: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) priority?: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) valid_from: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) valid_to?:
    | string
    | null;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RoutingScopeDto)
  scopes: RoutingScopeDto[];
}

export class UpdateRoutingRuleDto extends PartialType(
  OmitType(CreateRoutingRuleDto, ['company', 'code'] as const),
) {}
