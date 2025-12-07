import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationSpDto } from './create-relation_sp.dto';

export class UpdateRelationSpDto extends PartialType(CreateRelationSpDto) {}
