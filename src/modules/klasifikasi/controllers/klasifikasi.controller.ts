import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { KlasifikasiService } from '../services/klasifikasi.service';
import { CreateKlasifikasiDto } from '../dto/klasifikasi/create_klasifikasi.dto';
import { UpdateKlasifikasiDto } from '../dto/klasifikasi/update_klasifikasi.dto';

@Controller('persuratan/klasifikasi')
export class KlasifikasiController {
  constructor(private readonly klasifikasiService: KlasifikasiService) {}

  @Get()
  findAll(@Query('company') company?: string) {
    return this.klasifikasiService.findAll(company);
  }

  @Get('by-code/:company/:kode')
  findByCode(@Param('company') company: string, @Param('kode') kode: string) {
    return this.klasifikasiService.findByCode(company, kode);
  }

  @Post()
  create(@Body() createKlasifikasiDto: CreateKlasifikasiDto) {
    return this.klasifikasiService.create(createKlasifikasiDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.klasifikasiService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateKlasifikasiDto: UpdateKlasifikasiDto) {
    return this.klasifikasiService.update(id, updateKlasifikasiDto);
  }

  @Put(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.klasifikasiService.toggleActive(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.klasifikasiService.remove(id);
  }
}
