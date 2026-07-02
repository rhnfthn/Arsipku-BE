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
import { PositionService } from './position.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { OmPosition } from './entities/om-position.entity';
import { RequirePermission } from '../../../common/decorators';

@Controller('position')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  @RequirePermission('master-data', 'read')
  findAll(): Promise<OmPosition[]> {
    return this.positionService.findAll();
  }

  /**
   * Get all positions by company
   * @example GET /position/company/1?search=manager
   */
  @Get('company/:companyId')
  @RequirePermission('master-data', 'read')
  findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('search') search?: string,
  ) {
    return this.positionService.findByCompany(companyId, search);
  }

  /**
   * Get all positions by organization
   * Includes bod_tag from om_relation_osc
   * @example GET /position/organization/100?search=manager
   */
  @Get('organization/:organizationId')
  @RequirePermission('master-data', 'read')
  findByOrganization(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query('search') search?: string,
  ) {
    return this.positionService.findByOrganization(organizationId, search);
  }

  /**
   * Get positions with person count
   * @example GET /position/company/1/with-persons
   */
  @Get('company/:companyId/with-persons')
  @RequirePermission('master-data', 'read')
  findByCompanyWithPersons(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.positionService.findByCompanyWithPersons(companyId);
  }

  /**
   * Get chief positions only (managerial positions)
   * @example GET /position/company/1/chiefs
   */
  @Get('company/:companyId/chiefs')
  @RequirePermission('master-data', 'read')
  findChiefPositions(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<OmPosition[]> {
    return this.positionService.findChiefPositions(companyId);
  }

  @Get(':id')
  @RequirePermission('master-data', 'read')
  findOne(@Param('id') id: string): Promise<OmPosition> {
    return this.positionService.findOne(id);
  }

  /**
   * Create position
   * @example POST /position
   */
  @Post()
  @RequirePermission('master-data', 'create')
  create(
    @Body() data: CreatePositionDto,
  ) {
    return this.positionService.create(data);
  }

  /**
   * Update position
   * @example PUT /position/:id
   */
  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(
    @Param('id') id: string,
    @Body() data: UpdatePositionDto,
  ) {
    return this.positionService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.positionService.remove(id);
  }
}
