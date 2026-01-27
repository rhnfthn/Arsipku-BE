import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ParseIntPipe,
  Query,
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

  /**
   * Get all organizations by company
   * @example GET /organization/company/1
   */
  @Get('company/:companyId')
  findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<OmOrganization[]> {
    return this.organizationService.findByCompany(companyId);
  }

  /**
   * Get organization tree structure by company
   * @example GET /organization/company/1/tree
   */
  @Get('company/:companyId/tree')
  findTreeByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.organizationService.findTreeByCompany(companyId);
  }

  /**
   * Get organization with positions count
   * @example GET /organization/company/1/with-positions
   */
  @Get('company/:companyId/with-positions')
  findByCompanyWithPositions(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.organizationService.findByCompanyWithPositions(companyId);
  }

  /**
   * Get organization by ID with area details
   * @example GET /organization/1/details
   */
  @Get(':id/details')
  findOneWithDetails(@Param('id') id: string) {
    return this.organizationService.findOneWithDetails(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmOrganization> {
    return this.organizationService.findOne(id);
  }

  /**
   * Create organization for a company
   * @example POST /organization/company/1
   */
  @Post('company/:companyId')
  create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() data: CreateOrganizationDto,
  ) {
    return this.organizationService.create(companyId, data);
  }

  /**
   * Update organization
   * @example PUT /organization/company/1/:id
   */
  @Put('company/:companyId/:id')
  update(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id') id: string,
    @Body() data: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, companyId, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationService.remove(id);
  }
}
