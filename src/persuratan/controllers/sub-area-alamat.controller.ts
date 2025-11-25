import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { SubAreaAlamatService } from '../services/sub-area-alamat.service';
import { CreateSubAreaAlamatDto } from '../dto/sub-area-alamat/create-sub-area-alamat.dto';
import { UpdateSubAreaAlamatDto } from '../dto/sub-area-alamat/update-sub-area-alamat.dto';

@Controller('persuratan/sub-area-alamat')
export class SubAreaAlamatController {
  constructor(private readonly subAreaAlamatService: SubAreaAlamatService) {}

  @Post()
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
  update(@Param('id') id: string, @Body() updateSubAreaAlamatDto: UpdateSubAreaAlamatDto) {
    return this.subAreaAlamatService.update(id, updateSubAreaAlamatDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subAreaAlamatService.remove(id);
  }
}
