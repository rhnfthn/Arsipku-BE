import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OmOrganization } from './entities/om-organization.entity';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  findAll(): Promise<OmOrganization[]> {
    return this.organizationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmOrganization> {
    return this.organizationService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateOrganizationDto) {
    return this.organizationService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateOrganizationDto) {
    return this.organizationService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationService.remove(id);
  }
}
