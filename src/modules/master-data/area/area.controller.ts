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
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { OmArea } from './entities/om-area.entity';

@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Get()
  findAll(): Promise<OmArea[]> {
    return this.areaService.findAll();
  }

  /**
   * Get all areas by company with sub areas count
   * @example GET /area/company/1
   */
  @Get('company/:companyId')
  findByCompany(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.areaService.findByCompany(companyId);
  }

  /**
   * Get area by company and area code
   * @example GET /area/company/1/area/A01
   */
  @Get('company/:companyId/area/:areaCode')
  findByCompanyAndArea(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('areaCode') areaCode: string,
  ): Promise<OmArea> {
    return this.areaService.findByCompanyAndArea(companyId, areaCode);
  }

  /**
   * Create area for a company
   * @example POST /area/company/1
   */
  @Post('company/:companyId')
  create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() data: CreateAreaDto,
  ) {
    return this.areaService.create(companyId, data);
  }

  /**
   * Update area for a company
   * @example PUT /area/company/1/:id
   */
  @Put('company/:companyId/:id')
  update(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id') id: string,
    @Body() data: UpdateAreaDto,
  ) {
    return this.areaService.update(id, companyId, data);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OmArea> {
    return this.areaService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.areaService.remove(id);
  }
}
