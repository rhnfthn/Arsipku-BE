import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { SubAreaAlamatService } from '../services/sub_area_alamat.service';
import { CreateSubAreaAlamatDto } from '../dto/sub_area_alamat/create_sub_area_alamat.dto';
import { UpdateSubAreaAlamatDto } from '../dto/sub_area_alamat/update_sub_area_alamat.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/sub-area-alamat')
export class SubAreaAlamatController {
  constructor(private readonly subAreaAlamatService: SubAreaAlamatService) {}

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() createSubAreaAlamatDto: CreateSubAreaAlamatDto) {
    return this.subAreaAlamatService.create(createSubAreaAlamatDto);
  }

  @Get()
  findAll(@Query('company') company?: string, @Query('area') area?: string) {
    return this.subAreaAlamatService.findAll(company, area);
  }

  @Get('by-location/:company/:area/:sub_area')
  findBySubArea(
    @Param('company') company: string,
    @Param('area') area: string,
    @Param('sub_area') sub_area: string,
  ) {
    return this.subAreaAlamatService.findBySubArea(company, area, sub_area);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subAreaAlamatService.findOne(id);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(
    @Param('id') id: string,
    @Body() updateSubAreaAlamatDto: UpdateSubAreaAlamatDto,
  ) {
    return this.subAreaAlamatService.update(id, updateSubAreaAlamatDto);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.subAreaAlamatService.remove(id);
  }
}
