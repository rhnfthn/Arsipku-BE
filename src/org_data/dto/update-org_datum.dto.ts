import { PartialType } from '@nestjs/mapped-types';
import { CreateOrgDatumDto } from './create-org_datum.dto';

export class UpdateOrgDatumDto extends PartialType(CreateOrgDatumDto) {}
