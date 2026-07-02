import { Controller, Get, Post, Body, Put, Delete, Param, Query } from '@nestjs/common';
import { GrupPenerimaService } from '../services/grup_penerima.service';
import { CreateGrupPenerimaDto } from '../dto/grup_penerima/create_grup_penerima.dto';
import { UpdateGrupPenerimaDto } from '../dto/grup_penerima/update_grup_penerima.dto';
import { CreateGrupPenerimaDetailDto } from '../../grup-penerima-detail/dto/grup_penerima_detail/create_grup_penerima_detail.dto';
import { UpdateGrupPenerimaDetailDto } from '../../grup-penerima-detail/dto/grup_penerima_detail/update_grup_penerima_detail.dto';
import { GetGrupPenerimaQueryDto } from '../dto/grup_penerima/grup-penerima-response.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/grup-penerima')
export class GrupPenerimaController {
  constructor(private readonly grupPenerimaService: GrupPenerimaService) {}

  @Post()
  @RequirePermission('master-data', 'create')
  create(@Body() createGrupPenerimaDto: CreateGrupPenerimaDto) {
    return this.grupPenerimaService.create(createGrupPenerimaDto);
  }

  /**
   * GET /persuratan/grup-penerima
   * Get all grup penerima with enriched position detail from org_data
   * 
   * @param company - Filter by company
   * @param area - Filter by area
   * @param tgl - Optional date for org_data lookup (format: YYYY-MM-DD, default: today)
   * @param jenis - Optional filter by naskah type: 'ND' (Directors + EVP) or 'SDI' (GM)
   * 
   * @example
   * GET /persuratan/grup-penerima?company=10000&area=A000
   * GET /persuratan/grup-penerima?company=10000&area=A000&tgl=2026-02-05
   * GET /persuratan/grup-penerima?company=10000&area=A000&jenis=ND
   * GET /persuratan/grup-penerima?company=10000&area=A000&jenis=SDI
   */
  @Get()
  @RequirePermission('master-data', 'read')
  findAll(
    @Query('company') company?: string,
    @Query('area') area?: string,
    @Query('tgl') tgl?: string,
    @Query('jenis') jenis?: string,
  ) {
    return this.grupPenerimaService.findAllWithPositionDetail(company, area, tgl, jenis);
  }

  /**
   * GET /persuratan/grup-penerima/:id
   * Get single grup penerima with enriched position detail
   */
  @Get(':id')
  @RequirePermission('master-data', 'read')
  findOne(@Param('id') id: string, @Query('tgl') tgl?: string) {
    return this.grupPenerimaService.findOneWithPositionDetail(id, tgl);
  }

  @Put(':id')
  @RequirePermission('master-data', 'update')
  update(@Param('id') id: string, @Body() updateGrupPenerimaDto: UpdateGrupPenerimaDto) {
    return this.grupPenerimaService.update(id, updateGrupPenerimaDto);
  }

  @Put(':id/toggle-aktif')
  @RequirePermission('master-data', 'update')
  toggleAktif(@Param('id') id: string) {
    return this.grupPenerimaService.toggleAktif(id);
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  remove(@Param('id') id: string) {
    return this.grupPenerimaService.remove(id);
  }

  // ===== Member Management =====

  @Post(':id/members')
  @RequirePermission('master-data', 'create')
  addMember(@Param('id') id: string, @Body() createDetailDto: CreateGrupPenerimaDetailDto) {
    return this.grupPenerimaService.addMember(id, createDetailDto);
  }

  /**
   * GET /persuratan/grup-penerima/:id/members
   * Get members with enriched position detail from org_data
   */
  @Get(':id/members')
  @RequirePermission('master-data', 'read')
  getMembers(@Param('id') id: string, @Query('tgl') tgl?: string) {
    return this.grupPenerimaService.getMembersWithPositionDetail(id, tgl);
  }

  /**
   * GET /persuratan/grup-penerima/:id/expand
   * Expand grup to individual positions (used for sending naskah)
   * Returns array of OrgDataPositionDto for all positions in the grup
   */
  @Get(':id/expand')
  @RequirePermission('master-data', 'read')
  expandGrup(@Param('id') id: string, @Query('tgl') tgl?: string) {
    return this.grupPenerimaService.expandGrupToPositions(id, tgl);
  }

  @Put('members/:detailId')
  @RequirePermission('master-data', 'update')
  updateMember(@Param('detailId') detailId: string, @Body() updateDetailDto: UpdateGrupPenerimaDetailDto) {
    return this.grupPenerimaService.updateMember(detailId, updateDetailDto);
  }

  @Delete(':id/members/:detailId')
  @RequirePermission('master-data', 'delete')
  removeMember(@Param('detailId') detailId: string) {
    return this.grupPenerimaService.removeMember(detailId);
  }
}
