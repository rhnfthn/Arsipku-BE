import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateSuratDto } from './create-template-surat.dto';

export class UpdateTemplateSuratDto extends PartialType(CreateTemplateSuratDto) {}
