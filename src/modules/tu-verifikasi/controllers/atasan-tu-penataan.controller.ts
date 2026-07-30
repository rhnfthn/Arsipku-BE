import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TuVerifikasiService } from '../services/tu-verifikasi.service';
import {
  TuFilterDto,
  SetujuiPenerimaanDto,
  TolakPenerimaanDto,
  SetujuiTerakhirDto,
  SelesaiPenataanDto,
} from '../dto/tu-verifikasi.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AtasanTuGuard } from '../guards/atasan-tu-guard';
import { TuGuard } from '../guards/tu-guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

// ─── Atasan Managerial TU ───────────────────────────────────────────
@ApiTags('Atasan TU Verifikasi')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AtasanTuGuard)
@Controller('atasan-tu/verifikasi-persetujuan')
export class AtasanTuController {
  constructor(private readonly service: TuVerifikasiService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar usulan untuk Atasan Managerial TU' })
  async findAll(@Query() filter: TuFilterDto) {
    return this.service.findAllAtasanTu(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail usulan untuk Atasan TU' })
  async findOne(@Param('id') id: string) {
    return this.service.findOneForTu(id);
  }

  @Patch(':id/setujui-penerimaan')
  @ApiOperation({ summary: 'Setujui penerimaan oleh Atasan TU' })
  async setujuiPenerimaan(
    @Param('id') id: string,
    @Body() dto: SetujuiPenerimaanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setujuiPenerimaan(id, user, dto);
  }

  @Patch(':id/tolak-penerimaan')
  @ApiOperation({ summary: 'Tolak penerimaan oleh Atasan TU' })
  async tolakPenerimaan(
    @Param('id') id: string,
    @Body() dto: TolakPenerimaanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.tolakPenerimaan(id, user, dto);
  }

  @Patch(':id/setujui-terakhir')
  @ApiOperation({ summary: 'Setujui persetujuan terakhir oleh Atasan TU' })
  async setujuiTerakhir(
    @Param('id') id: string,
    @Body() dto: SetujuiTerakhirDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setujuiTerakhir(id, user, dto);
  }
}

// ─── TU Penataan Arsip ──────────────────────────────────────────────
@ApiTags('TU Penataan Arsip')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TuGuard)
@Controller('tu/penataan-arsip')
export class TuPenataanController {
  constructor(private readonly service: TuVerifikasiService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar arsip untuk penataan di TU' })
  async findAll(@Query() filter: TuFilterDto) {
    return this.service.findAllPenataan(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail arsip untuk penataan' })
  async findOne(@Param('id') id: string) {
    return this.service.findOneForTu(id);
  }

  @Patch(':id/selesai')
  @ApiOperation({ summary: 'Selesai penataan arsip' })
  async selesaiPenataan(
    @Param('id') id: string,
    @Body() dto: SelesaiPenataanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.selesaiPenataan(id, user, dto);
  }
}