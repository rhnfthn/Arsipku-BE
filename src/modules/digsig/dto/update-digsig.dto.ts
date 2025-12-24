import { PartialType } from '@nestjs/mapped-types';
import { CreateDigsigDto } from './create-digsig.dto';

export class UpdateDigsigDto extends PartialType(CreateDigsigDto) {}
