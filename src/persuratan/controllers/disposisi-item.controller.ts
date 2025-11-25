import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { DisposisiItemService } from '../services/disposisi-item.service';
import { CreateDisposisiItemDto } from '../dto/disposisi-item/create-disposisi-item.dto';
import { UpdateDisposisiItemDto } from '../dto/disposisi-item/update-disposisi-item.dto';

@Controller('persuratan/disposisi-item')
export class DisposisiItemController {
  constructor(private readonly disposisiItemService: DisposisiItemService) {}

  @Post()
  create(@Body() createDisposisiItemDto: CreateDisposisiItemDto) {
    return this.disposisiItemService.create(createDisposisiItemDto);
  }

  @Get()
  findAll(@Query('company') company?: string) {
    return this.disposisiItemService.findAll(company);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disposisiItemService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDisposisiItemDto: UpdateDisposisiItemDto) {
    return this.disposisiItemService.update(id, updateDisposisiItemDto);
  }

  @Put(':id/toggle-aktif')
  toggleAktif(@Param('id') id: string) {
    return this.disposisiItemService.toggleAktif(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.disposisiItemService.remove(id);
  }
}
