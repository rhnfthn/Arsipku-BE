import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { PositionService } from './position.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { OmPosition } from './entities/om-position.entity';

@Controller('position')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  findAll(): Promise<OmPosition[]> {
    return this.positionService.findAll();
  }

  /**
   * Get all positions by company
   * @example GET /position/company/1
   */
  @Get('company/:companyId')
  findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<OmPosition[]> {
    return this.positionService.findByCompany(companyId);
  }

  /**
   * Get all positions by organization
   * Includes bod_tag from om_relation_osc
   * @example GET /position/organization/100
   */
  @Get('organization/:organizationId')
  findByOrganization(
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    return this.positionService.findByOrganization(organizationId);
  }

  /**
   * Get positions with person count
   * @example GET /position/company/1/with-persons
   */
  @Get('company/:companyId/with-persons')
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
  findChiefPositions(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<OmPosition[]> {
    return this.positionService.findChiefPositions(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmPosition> {
    return this.positionService.findOne(id);
  }

  /**
   * Create position
   * @example POST /position
   */
  @Post()
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
  update(
    @Param('id') id: string,
    @Body() data: UpdatePositionDto,
  ) {
    return this.positionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.positionService.remove(id);
  }
}
