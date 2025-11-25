import { PartialType } from '@nestjs/mapped-types';
import { CreateGrupPenerimaDto } from './create-grup-penerima.dto';

export class UpdateGrupPenerimaDto extends PartialType(CreateGrupPenerimaDto) {}
