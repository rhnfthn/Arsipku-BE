import { PartialType } from '@nestjs/mapped-types';
import { CreateLabelDto } from './create_label.dto';

export class UpdateLabelDto extends PartialType(CreateLabelDto) {}
