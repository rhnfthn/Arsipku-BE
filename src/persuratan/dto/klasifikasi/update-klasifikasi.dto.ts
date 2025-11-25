import { PartialType } from '@nestjs/mapped-types';
import { CreateKlasifikasiDto } from './create-klasifikasi.dto';

export class UpdateKlasifikasiDto extends PartialType(CreateKlasifikasiDto) {}
