import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationOdDto } from './create-relation_od.dto';

export class UpdateRelationOdDto extends PartialType(CreateRelationOdDto) {}
