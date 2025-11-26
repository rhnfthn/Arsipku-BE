import { PartialType } from '@nestjs/mapped-types';
import { CreateDisposisiItemDto } from './create_disposisi_item.dto';

export class UpdateDisposisiItemDto extends PartialType(CreateDisposisiItemDto) {}
