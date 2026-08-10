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
  VerifikasiBerkasDto,
  AjukanAtasanTuDto,
  KembalikanDto,
} from '../dto/tu-verifikasi.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TuGuard } from '../guards/tu-guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@ApiTags('TU Verifikasi')
@ApiBearerAuth()
@Controller('tu/notifikasi-usulan')
export class TuVerifikasiController {
  constructor(private readonly service: TuVerifikasiService) {}

  /** GET: semua user login bisa lihat daftar notifikasi (tidak dibatasi TuGuard). */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Daftar notifikasi usulan pindah arsip untuk TU' })
  async findAll(@Query() filter: TuFilterDto) {
    return this.service.findAllNotifikasi(filter);
  }

  @Get('atasan-tu-list')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Daftar atasan managerial TU (Corporate Secretary)',
  })
  async getAtasanTuList() {
    return this.service.getAtasanTuList();
  }

  @Get('is-atasan-tu')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Cek apakah user login terdaftar sebagai atasan TU di usulan apapun',
  })
  async isAtasanTu(@CurrentUser() user: JwtPayload) {
    return this.service.isAtasanTu(user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detail usulan untuk TU' })
  async findOne(@Param('id') id: string) {
    return this.service.findOneForTu(id);
  }

  @Patch(':id/verifikasi-berkas')
  @UseGuards(JwtAuthGuard, TuGuard)
  @ApiOperation({ summary: 'Verifikasi berkas fisik oleh TU' })
  async verifikasiBerkas(
    @Param('id') id: string,
    @Body() dto: VerifikasiBerkasDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.verifikasiBerkas(id, user, dto);
  }

  @Patch(':id/ajukan-atasan-tu')
  @UseGuards(JwtAuthGuard, TuGuard)
  @ApiOperation({ summary: 'Ajukan ke Atasan Managerial TU' })
  async ajukanAtasanTu(
    @Param('id') id: string,
    @Body() dto: AjukanAtasanTuDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.ajukanAtasanTu(id, user, dto);
  }

  @Patch(':id/kembalikan')
  @UseGuards(JwtAuthGuard, TuGuard)
  @ApiOperation({ summary: 'Kembalikan berkas ke Atasan/Sekretaris' })
  async kembalikan(
    @Param('id') id: string,
    @Body() dto: KembalikanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.kembalikanKeAtasan(id, user, dto);
  }
}
