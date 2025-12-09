import { PartialType } from '@nestjs/mapped-types';
import { CreateBerkasDto } from './create-berkas.dto';

export class UpdateBerkasDto extends PartialType(CreateBerkasDto) {}
