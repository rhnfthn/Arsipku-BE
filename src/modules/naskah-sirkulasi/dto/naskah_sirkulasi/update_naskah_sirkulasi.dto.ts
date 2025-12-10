import { PartialType } from '@nestjs/mapped-types';
import { CreateNaskahSirkulasiDto } from './create_naskah_sirkulasi.dto';

export class UpdateNaskahSirkulasiDto extends PartialType(
  CreateNaskahSirkulasiDto,
) {}
