import { PartialType } from '@nestjs/mapped-types';
import { CreateAreasubDto } from './create-areasub.dto';

export class UpdateAreasubDto extends PartialType(CreateAreasubDto) {}
