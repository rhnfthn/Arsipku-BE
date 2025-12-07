import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationOaDto } from './create-relation_oa.dto';

export class UpdateRelationOaDto extends PartialType(CreateRelationOaDto) {}
