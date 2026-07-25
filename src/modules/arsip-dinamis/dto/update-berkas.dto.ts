import { PartialType } from '@nestjs/mapped-types';
import { CreateArsipDinamisBerkasDto } from './create-berkas.dto';

export class UpdateArsipDinamisBerkasDto extends PartialType(
  CreateArsipDinamisBerkasDto,
) {}
