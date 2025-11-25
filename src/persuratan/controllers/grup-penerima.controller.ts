import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { GrupPenerimaService } from '../services/grup-penerima.service';
import { CreateGrupPenerimaDto } from '../dto/grup-penerima/create-grup-penerima.dto';
import { UpdateGrupPenerimaDto } from '../dto/grup-penerima/update-grup-penerima.dto';
import { AddMemberGrupPenerimaDto } from '../dto/grup-penerima/add-member.dto';

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
  addMember(@Param('id') id: string, @Body() addMemberDto: AddMemberGrupPenerimaDto) {
    return this.grupPenerimaService.addMember(id, addMemberDto);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.grupPenerimaService.getMembers(id);
  }

  @Delete(':id/members/:detailId')
  removeMember(@Param('detailId') detailId: string) {
    return this.grupPenerimaService.removeMember(detailId);
  }
}
