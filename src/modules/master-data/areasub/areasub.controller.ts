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
import { AreasubService } from './areasub.service';
import { CreateAreasubDto } from './dto/create-areasub.dto';
import { UpdateAreasubDto } from './dto/update-areasub.dto';
import { OmAreaSub } from './entities/om-areasub.entity';

@Controller('areasub')
export class AreasubController {
  constructor(private readonly subAreaService: AreasubService) {}

  @Get()
  findAll(): Promise<any[]> {
    return this.subAreaService.findAll();
  }

  /**
   * Get all sub areas by company
   * @example GET /areasub/company/1
   */
  @Get('company/:companyId')
  findByCompany(@Param('companyId', ParseIntPipe) companyId: number): Promise<any[]> {
    return this.subAreaService.findByCompany(companyId);
  }

  /**
   * Get all sub areas by company and area
   * @example GET /areasub/company/1/area/A01
   */
  @Get('company/:companyId/area/:areaCode')
  findByCompanyAndArea(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('areaCode') areaCode: string,
  ): Promise<any[]> {
    return this.subAreaService.findByCompanyAndArea(companyId, areaCode);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<any> {
    return this.subAreaService.findOne(id);
  }

  /**
   * Create sub area for a company
   * @example POST /areasub/company/1
   */
  @Post('company/:companyId')
  create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() data: CreateAreasubDto,
  ) {
    return this.subAreaService.create(companyId, data);
  }

  /**
   * Update sub area for a company
   * @example PUT /areasub/company/1/:id
   */
  @Put('company/:companyId/:id')
  update(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id') id: string,
    @Body() data: UpdateAreasubDto,
  ) {
    return this.subAreaService.update(id, companyId, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subAreaService.remove(id);
  }
}
