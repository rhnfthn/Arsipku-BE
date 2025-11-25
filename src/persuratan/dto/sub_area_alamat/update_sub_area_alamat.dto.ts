import { PartialType } from '@nestjs/mapped-types';
import { CreateSubAreaAlamatDto } from './create_sub_area_alamat.dto';

export class UpdateSubAreaAlamatDto extends PartialType(CreateSubAreaAlamatDto) {}
