import { PartialType } from '@nestjs/mapped-types';
import { CreateEksternalDto } from './create_eksternal.dto';

export class UpdateEksternalDto extends PartialType(CreateEksternalDto) {}
