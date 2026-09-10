import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFiles,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { JenisService } from '../services/jenis.service';
import { JenisResponseDto } from '../dto/jenis.dto';
import { CreateJenisDto } from '../dto/create-jenis.dto';
import { UpdateJenisDto } from '../dto/update-jenis.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('jenis')
export class JenisController {
  private readonly logger = new Logger(JenisController.name);

  constructor(private readonly jenisService: JenisService) {}

  /**
   * GET /jenis
   * Mengambil semua jenis surat dengan file URLs (original & regex)
   */
  @Get()
  async findAll(): Promise<any> {
    return await this.jenisService.findAll();
  }

  /**
   * GET /jenis/code/:code
   * Mengambil jenis by kode
   */
  @Get('code/:code')
  async findByCode(@Param('code') code: string) {
    const jenis = await this.jenisService.findByCode(code);
    const fileOriginalKey = jenis.fileOriginal || null;
    const fileRegexKey = jenis.fileRegex || null;

    const [fileOriginalUrl, fileRegexUrl, legacyFileUrl] = await Promise.all([
      fileOriginalKey ? this.jenisService.getFileUrl(fileOriginalKey) : null,
      fileRegexKey ? this.jenisService.getFileUrl(fileRegexKey) : null,
      jenis.fileName ? this.jenisService.getFileUrl(jenis.fileName) : null,
    ]);

    return {
      success: true,
      data: {
        id: jenis.id,
        jenis: jenis.jenis,
        jenis_text: jenis.jenisText,
        file_name: jenis.fileName,
        file_url: legacyFileUrl || fileRegexUrl || fileOriginalUrl,
        file_text: jenis.fileText,
        file_original: fileOriginalKey,
        file_original_url: fileOriginalUrl,
        file_regex: fileRegexKey,
        file_regex_url: fileRegexUrl,
        format_penomoran: jenis.formatPenomoran,
      },
    };
  }

  /**
   * POST /jenis
   * Membuat jenis baru dengan 2 upload template:
   * - file_original (templates/naskah-lainnya-original/)
   * - file_regex (templates/naskah-lainnya/)
   */
  @Post()
  @RequirePermission('master-data', 'create')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file_original', maxCount: 1 },
        { name: 'file_regex', maxCount: 1 },
        { name: 'file', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB max
        },
      },
    ),
  )
  async create(
    @Body() dto: CreateJenisDto,
    @UploadedFiles()
    files?: {
      file_original?: Express.Multer.File[];
      file_regex?: Express.Multer.File[];
      file?: Express.Multer.File[];
    },
  ) {
    try {
      this.logger.log(`Creating jenis: ${JSON.stringify(dto)}`);
      const jenis = await this.jenisService.create(dto, {
        fileOriginal: files?.file_original?.[0],
        fileRegex: files?.file_regex?.[0],
        file: files?.file?.[0],
      });

      const fileOriginalKey = jenis.fileOriginal || null;
      const fileRegexKey = jenis.fileRegex || null;

      const [fileOriginalUrl, fileRegexUrl, legacyFileUrl] = await Promise.all([
        fileOriginalKey ? this.jenisService.getFileUrl(fileOriginalKey) : null,
        fileRegexKey ? this.jenisService.getFileUrl(fileRegexKey) : null,
        jenis.fileName ? this.jenisService.getFileUrl(jenis.fileName) : null,
      ]);

      return {
        success: true,
        message: 'Jenis berhasil dibuat',
        data: {
          id: jenis.id,
          jenis: jenis.jenis,
          jenis_text: jenis.jenisText,
          file_name: jenis.fileName,
          file_url: legacyFileUrl || fileRegexUrl || fileOriginalUrl,
          file_text: jenis.fileText,
          file_original: fileOriginalKey,
          file_original_url: fileOriginalUrl,
          file_regex: fileRegexKey,
          file_regex_url: fileRegexUrl,
          format_penomoran: jenis.formatPenomoran,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create jenis: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Gagal membuat jenis');
    }
  }

  /**
   * GET /jenis/:id
   * Mengambil jenis by ID dengan 2 file URLs
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const jenis = await this.jenisService.findOne(id);
    const fileOriginalKey = jenis.fileOriginal || null;
    const fileRegexKey = jenis.fileRegex || null;

    const [fileOriginalUrl, fileRegexUrl, legacyFileUrl] = await Promise.all([
      fileOriginalKey ? this.jenisService.getFileUrl(fileOriginalKey) : null,
      fileRegexKey ? this.jenisService.getFileUrl(fileRegexKey) : null,
      jenis.fileName ? this.jenisService.getFileUrl(jenis.fileName) : null,
    ]);

    return {
      success: true,
      data: {
        id: jenis.id,
        jenis: jenis.jenis,
        jenis_text: jenis.jenisText,
        file_name: jenis.fileName,
        file_url: legacyFileUrl || fileRegexUrl || fileOriginalUrl,
        file_text: jenis.fileText,
        file_original: fileOriginalKey,
        file_original_url: fileOriginalUrl,
        file_regex: fileRegexKey,
        file_regex_url: fileRegexUrl,
        format_penomoran: jenis.formatPenomoran,
      },
    };
  }

  /**
   * PUT /jenis/:id
   * Update jenis dengan 2 upload template opsional
   */
  @Put(':id')
  @RequirePermission('master-data', 'update')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file_original', maxCount: 1 },
        { name: 'file_regex', maxCount: 1 },
        { name: 'file', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB max
        },
      },
    ),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateJenisDto,
    @UploadedFiles()
    files?: {
      file_original?: Express.Multer.File[];
      file_regex?: Express.Multer.File[];
      file?: Express.Multer.File[];
    },
  ) {
    try {
      this.logger.log(`Updating jenis ${id}: ${JSON.stringify(dto)}`);
      const jenis = await this.jenisService.update(id, dto, {
        fileOriginal: files?.file_original?.[0],
        fileRegex: files?.file_regex?.[0],
        file: files?.file?.[0],
      });

      const fileOriginalKey = jenis.fileOriginal || null;
      const fileRegexKey = jenis.fileRegex || null;

      const [fileOriginalUrl, fileRegexUrl, legacyFileUrl] = await Promise.all([
        fileOriginalKey ? this.jenisService.getFileUrl(fileOriginalKey) : null,
        fileRegexKey ? this.jenisService.getFileUrl(fileRegexKey) : null,
        jenis.fileName ? this.jenisService.getFileUrl(jenis.fileName) : null,
      ]);

      return {
        success: true,
        message: 'Jenis berhasil diupdate',
        data: {
          id: jenis.id,
          jenis: jenis.jenis,
          jenis_text: jenis.jenisText,
          file_name: jenis.fileName,
          file_url: legacyFileUrl || fileRegexUrl || fileOriginalUrl,
          file_text: jenis.fileText,
          file_original: fileOriginalKey,
          file_original_url: fileOriginalUrl,
          file_regex: fileRegexKey,
          file_regex_url: fileRegexUrl,
          format_penomoran: jenis.formatPenomoran,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to update jenis ${id}: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Gagal mengupdate jenis');
    }
  }

  /**
   * GET /jenis/:id/check-usage
   * Cek penggunaan jenis sebelum hapus
   */
  @Get(':id/check-usage')
  async checkUsage(@Param('id') id: string) {
    return this.jenisService.checkUsage(id);
  }

  /**
   * DELETE /jenis/:id
   * Hapus jenis
   */
  @Delete(':id')
  @RequirePermission('master-data', 'delete')
  async remove(@Param('id') id: string) {
    const result = await this.jenisService.remove(id);
    return {
      success: true,
      message: result.message,
    };
  }
}
