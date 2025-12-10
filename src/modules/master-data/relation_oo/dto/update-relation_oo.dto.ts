import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationOoDto } from './create-relation_oo.dto';

export class UpdateRelationOoDto extends PartialType(CreateRelationOoDto) {}
