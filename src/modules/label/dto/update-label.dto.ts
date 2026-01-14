import { PartialType } from '@nestjs/mapped-types';
import { CreateLabelDto } from './create-label.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateLabelDto extends PartialType(CreateLabelDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
