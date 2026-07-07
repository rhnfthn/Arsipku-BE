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
import { RequirePermission } from '../../../common/decorators';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  findAll(): Promise<OmOrganization[]> {
    return this.organizationService.findAll();
  }

  /**
   * Get all organizations by company
   * @example GET /organization/company/1?search=finance
   */
  @Get('company/:companyId')
  findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('search') search?: string,
  ) {
    return this.organizationService.findByCompany(companyId, search);
  }

  /**
   * Get organization tree structure by company
   * @example GET /organization/company/1/tree?search=finance
   */
  @Get('company/:companyId/tree')
  findTreeByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('search') search?: string,
  ) {
    return this.organizationService.findTreeByCompany(companyId, search);
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

  /**
   * Get organization with parent information
   * @example GET /organization/company/10000/1/with-parent
   */
  @Get('company/:companyId/:id/with-parent')
  findOneWithParent(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id') id: string,
  ) {
    return this.organizationService.findOneWithParent(id, companyId);
  }

  /**
   * Get all child organizations by parent organization ID
   * @example GET /organization/10001072/children
   */
  @Get(':parentOrgId/children')
  findChildOrganizations(
    @Param('parentOrgId', ParseIntPipe) parentOrgId: number,
  ) {
    return this.organizationService.findChildOrganizations(parentOrgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmOrganization> {
    return this.organizationService.findOne(id);
  }

  /**
   * Create organization
   * @example POST /organization
   */
  @Post()
  @RequirePermission('master-data', 'create')
  create(
    @Body() data: CreateOrganizationDto,
  ) {
    return this.organizationService.create(data);
  }

  /**
   * Update organization
   * @example PUT /organization/:id
   */
  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(
    @Param('id') id: string,
    @Body() data: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.organizationService.remove(id);
  }
}
