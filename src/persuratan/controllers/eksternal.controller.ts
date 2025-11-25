import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { EksternalService } from '../services/eksternal.service';
import { CreateEksternalDto } from '../dto/eksternal/create_eksternal.dto';
import { UpdateEksternalDto } from '../dto/eksternal/update_eksternal.dto';

@Controller('persuratan/eksternal')
export class EksternalController {
  constructor(private readonly eksternalService: EksternalService) {}

  @Post()
  create(@Body() createEksternalDto: CreateEksternalDto) {
    return this.eksternalService.create(createEksternalDto);
  }

  @Get()
  findAll(@Query('company') company?: string, @Query('area') area?: string) {
    return this.eksternalService.findAll(company, area);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eksternalService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateEksternalDto: UpdateEksternalDto) {
    return this.eksternalService.update(id, updateEksternalDto);
  }

  @Put(':id/toggle-aktif')
  toggleAktif(@Param('id') id: string) {
    return this.eksternalService.toggleAktif(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.eksternalService.remove(id);
  }
}
