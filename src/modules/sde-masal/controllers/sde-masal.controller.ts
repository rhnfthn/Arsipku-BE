import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { SdeMasalService } from '../services/sde-masal.service';
import { CreateSdeMasalConceptDto } from '../dto/create-sde-masal-concept.dto';
import { UpdateSdeMasalDto } from '../dto/update-sde-masal.dto';
import { SdeMasalFilterDto } from '../dto/sde-masal-filter.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';

/**
 * Controller API SDE Masal (Surat Dinas Eksternal Massal).
 *
 * Endpoint:
 * - POST   /sde-masal/concept          — simpan konsep
 * - POST   /sde-masal/upload            — upload Excel
 * - GET    /sde-masal/template          — download template Excel
 * - GET    /sde-masal                   — list dengan filter
 * - GET    /sde-masal/summary           — ringkasan dashboard
 * - GET    /sde-masal/:id               — detail
 * - PATCH  /sde-masal/:id               — update
 * - DELETE /sde-masal/:id               — hapus
 * - POST   /sde-masal/:id/lampiran      — upload lampiran
 */
@ApiTags('SDE Masal')
@ApiBearerAuth()
@Controller('sde-masal')
@UseGuards(JwtAuthGuard)
export class SdeMasalController {
  constructor(private readonly sdeMasalService: SdeMasalService) {}

  /**
   * POST /sde-masal/concept — simpan konsep (Form 1).
   */
  @Post('concept')
  async createConcept(@Body() dto: CreateSdeMasalConceptDto) {
    const data = await this.sdeMasalService.createConcept(dto);
    return { success: true, data };
  }

  /**
   * POST /sde-masal/upload — upload Excel (Form 2).
   * Multipart form-data: file, conceptId, skemaTemplate, versiTemplate
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('conceptId') conceptId: string,
    @Body('skemaTemplate') skemaTemplate: string,
    @Body('versiTemplate') versiTemplate: string,
  ) {
    if (!file) {
      return { success: false, message: 'File tidak ditemukan' };
    }
    if (!file.originalname.match(/\.(xlsx|xls)$/i)) {
      return {
        success: false,
        message: 'File harus berformat .xlsx atau .xls',
      };
    }
    const result = await this.sdeMasalService.processExcelUpload(
      file.buffer,
      conceptId,
      skemaTemplate,
      versiTemplate,
    );
    return { success: true, data: result };
  }

  /**
   * POST /sde-masal/generate — generate massal dari data wizard (Step 4).
   * Body: { konsep, penerimaList, template }
   */
  @Post('generate')
  async generateMassal(@Body() body: any) {
    const result = await this.sdeMasalService.generateMassal(body);
    return { success: true, data: result };
  }

  /**
   * POST /sde-masal/generate-naskah — buat naskah SDE individual per penerima.
   * Body: { ids?: string[] } — jika kosong, proses semua yang MENUNGGU.
   */
  @Post('generate-naskah')
  async generateNaskah(
    @Body() body: { ids?: string[] },
    @CurrentUser() user: any,
  ) {
    const result = await this.sdeMasalService.generateAndSendNaskah(body?.ids, user?.position);
    return {
      success: true,
      data: result,
      message: `${result.success} naskah SDE berhasil dibuat, ${result.failed} gagal.`,
    };
  }

  /**
   * GET /sde-masal/template — download template Excel.
   */
  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buf = await this.sdeMasalService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="template-sde-masal.xlsx"',
    );
    res.send(buf);
  }

  /**
   * GET /sde-masal/naskah/:naskahId — detail naskah SDE individual by naskahId.
   * Mengembalikan data naskah + sirkulasi lengkap untuk ditampilkan di detail.
   */
  @Get('naskah/:naskahId')
  async findNaskahDetail(@Param('naskahId') naskahId: string) {
    const data = await this.sdeMasalService.findNaskahDetail(naskahId);
    if (!data) {
      return { success: false, message: 'Naskah tidak ditemukan', data: null };
    }
    return { success: true, data };
  }

  /**
   * GET /sde-masal — list dengan filter dan pagination.
   */
  @Get()
  async findAll(@Query() filter: SdeMasalFilterDto) {
    const result = await this.sdeMasalService.findAll(filter);
    return { success: true, ...result };
  }

  /**
   * GET /sde-masal/summary — ringkasan dashboard.
   */
  @Get('summary')
  async getSummary() {
    const data = await this.sdeMasalService.getSummary();
    return { success: true, data };
  }

  /**
   * GET /sde-masal/:id — detail item.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.sdeMasalService.findOne(id);
    if (!data) {
      return { success: false, message: 'Data tidak ditemukan', data: null };
    }
    return { success: true, data };
  }

  /**
   * PATCH /sde-masal/:id — update item.
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSdeMasalDto) {
    const data = await this.sdeMasalService.update(id, dto);
    if (!data) {
      return { success: false, message: 'Data tidak ditemukan', data: null };
    }
    return { success: true, data };
  }

  /**
   * DELETE /sde-masal/:id — hapus item.
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const ok = await this.sdeMasalService.remove(id);
    if (!ok) {
      return { success: false, message: 'Data tidak ditemukan' };
    }
    return { success: true, message: 'Data berhasil dihapus' };
  }

  /**
   * POST /sde-masal/:id/lampiran — upload lampiran.
   */
  @Post(':id/lampiran')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLampiran(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { success: false, message: 'File tidak ditemukan' };
    }
    // Simpan lampiran URL sederhana (bisa integrasi MinIO nanti)
    const lampiranUrl = `sde-masal/${id}/${file.originalname}`;
    const data = await this.sdeMasalService.uploadLampiran(id, lampiranUrl);
    if (!data) {
      return { success: false, message: 'Data tidak ditemukan', data: null };
    }
    return { success: true, data };
  }
}
