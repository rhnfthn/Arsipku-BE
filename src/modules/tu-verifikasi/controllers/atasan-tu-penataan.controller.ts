import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { Public } from '../../../common/decorators/public.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { Response } from 'express';

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

  /** Update foto penataan saja (tanpa ubah status) — untuk edit foto. */
  @Patch(':id/update-foto')
  @ApiOperation({ summary: 'Update foto penataan arsip (tanpa ubah status)' })
  async updateFotoPenataan(
    @Param('id') id: string,
    @Body('fotoPenataan') fotoKey: string,
  ) {
    const data = await this.service.updateFotoPenataan(id, fotoKey);
    return { success: true, data };
  }

  /** Upload foto lampiran penataan arsip (Max 5MB, image only). */
  @Post('upload-foto')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload foto lampiran penataan arsip' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else
          cb(
            new BadRequestException(
              `Tipe file tidak diizinkan: ${file.mimetype}. Hanya JPEG, PNG, WebP, GIF.`,
            ),
            false,
          );
      },
    }),
  )
  async uploadFotoPenataan(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File tidak ditemukan');
    const data = await this.service.uploadFotoPenataan(file);
    return { success: true, data };
  }

  /** Ambil/preview foto lampiran penataan arsip (inline). */
  @Public()
  @Get('foto')
  @ApiOperation({ summary: 'Ambil foto lampiran penataan arsip' })
  async getFotoPenataan(@Query('key') key: string, @Res() res: Response) {
    const { buffer, contentType } = await this.service.getFotoPenataan(key);
    const filename = key.split('/').pop() || 'foto-penataan';
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.send(buffer);
  }
}
