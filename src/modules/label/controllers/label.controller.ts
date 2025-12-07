import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { LabelService } from '../services/label.service';
import { CreateLabelDto } from '../dto/label/create_label.dto';
import { UpdateLabelDto } from '../dto/label/update_label.dto';

@Controller('persuratan/label')
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Post()
  create(@Body() createLabelDto: CreateLabelDto) {
    return this.labelService.create(createLabelDto);
  }

  @Get()
  findAll(@Query('persnum') persnum?: string) {
    return this.labelService.findAll(persnum);
  }

  @Get('parent/:id_parent')
  findByParent(@Param('id_parent') id_parent: string) {
    return this.labelService.findByParent(id_parent);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.labelService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateLabelDto: UpdateLabelDto) {
    return this.labelService.update(id, updateLabelDto);
  }

  @Put(':id/toggle-aktif')
  toggleAktif(@Param('id') id: string) {
    return this.labelService.toggleAktif(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.labelService.remove(id);
  }
}
