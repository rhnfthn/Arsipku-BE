import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationOscDto } from './create-relation_osc.dto';

export class UpdateRelationOscDto extends PartialType(CreateRelationOscDto) {}
