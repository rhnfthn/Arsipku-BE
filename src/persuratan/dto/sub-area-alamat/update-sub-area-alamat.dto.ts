import { PartialType } from '@nestjs/mapped-types';
import { CreateSubAreaAlamatDto } from './create-sub-area-alamat.dto';

export class UpdateSubAreaAlamatDto extends PartialType(CreateSubAreaAlamatDto) {}
