import { PartialType } from '@nestjs/mapped-types';
import { CreateLiteraturEnDto } from './create-literatur-en.dto';

export class UpdateLiteraturEnDto extends PartialType(CreateLiteraturEnDto) {}
