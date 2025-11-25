import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationODto } from './create-relation_o.dto';

export class UpdateRelationODto extends PartialType(CreateRelationODto) {}
