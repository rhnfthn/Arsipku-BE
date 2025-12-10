import { PartialType } from '@nestjs/mapped-types';
import { CreateTitelaturEnDto } from './create-titelatur-en.dto';

export class UpdateTitelaturEnDto extends PartialType(CreateTitelaturEnDto) {}
