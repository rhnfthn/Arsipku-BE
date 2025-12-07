import { PartialType } from '@nestjs/mapped-types';
import { CreateGrupPenerimaDto } from './create_grup_penerima.dto';

export class UpdateGrupPenerimaDto extends PartialType(CreateGrupPenerimaDto) {}
