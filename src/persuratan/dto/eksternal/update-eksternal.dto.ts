import { PartialType } from '@nestjs/mapped-types';
import { CreateEksternalDto } from './create-eksternal.dto';

export class UpdateEksternalDto extends PartialType(CreateEksternalDto) {}
