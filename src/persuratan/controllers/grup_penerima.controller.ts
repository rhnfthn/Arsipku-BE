import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { GrupPenerimaService } from '../services/grup_penerima.service';
import { CreateGrupPenerimaDto } from '../dto/grup_penerima/create_grup_penerima.dto';
import { UpdateGrupPenerimaDto } from '../dto/grup_penerima/update_grup_penerima.dto';
import { CreateGrupPenerimaDetailDto } from '../dto/grup_penerima_detail/create_grup_penerima_detail.dto';
import { UpdateGrupPenerimaDetailDto } from '../dto/grup_penerima_detail/update_grup_penerima_detail.dto';

@Controller('persuratan/grup-penerima')
export class GrupPenerimaController {
  constructor(private readonly grupPenerimaService: GrupPenerimaService) {}

  @Post()
  create(@Body() createGrupPenerimaDto: CreateGrupPenerimaDto) {
    return this.grupPenerimaService.create(createGrupPenerimaDto);
  }

  @Get()
  findAll(@Query('company') company?: string, @Query('area') area?: string) {
    return this.grupPenerimaService.findAll(company, area);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.grupPenerimaService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateGrupPenerimaDto: UpdateGrupPenerimaDto) {
    return this.grupPenerimaService.update(id, updateGrupPenerimaDto);
  }

  @Put(':id/toggle-aktif')
  toggleAktif(@Param('id') id: string) {
    return this.grupPenerimaService.toggleAktif(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.grupPenerimaService.remove(id);
  }

  // ===== Member Management =====

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() createDetailDto: CreateGrupPenerimaDetailDto) {
    return this.grupPenerimaService.addMember(id, createDetailDto);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.grupPenerimaService.getMembers(id);
  }

  @Put('members/:detailId')
  updateMember(@Param('detailId') detailId: string, @Body() updateDetailDto: UpdateGrupPenerimaDetailDto) {
    return this.grupPenerimaService.updateMember(detailId, updateDetailDto);
  }

  @Delete(':id/members/:detailId')
  removeMember(@Param('detailId') detailId: string) {
    return this.grupPenerimaService.removeMember(detailId);
  }
}
