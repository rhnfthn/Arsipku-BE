import { PartialType } from '@nestjs/mapped-types';
import { CreateDisposisiItemDto } from './create-disposisi-item.dto';

export class UpdateDisposisiItemDto extends PartialType(CreateDisposisiItemDto) {}
