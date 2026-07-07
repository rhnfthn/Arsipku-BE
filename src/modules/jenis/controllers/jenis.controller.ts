import { Controller, Get, Post, Put, Delete, Body, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JenisService } from '../services/jenis.service';
import { JenisResponseDto } from '../dto/jenis.dto';
import { CreateJenisDto } from '../dto/create-jenis.dto';
import { UpdateJenisDto } from '../dto/update-jenis.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('jenis')
export class JenisController {
  constructor(private readonly jenisService: JenisService) {}

  /**
   * GET /jenis
   * Mengambil semua jenis surat dengan file URLs
   */
  @Get()
  async findAll(): Promise<any> {
    const result = await this.jenisService.findAll();
    
    // Add file URLs to response
    const dataWithUrls = await Promise.all(
      result.data.map(async (item) => {
        const fileUrl = item.jenis ? await this.jenisService.getFileUrl(item.jenis) : null;
        return {
          ...item,
          file_url: fileUrl,
        };
      }),
    );

    return {
      ...result,
      data: dataWithUrls,
    };
  }

  /**
   * GET /jenis/code/:code
   * Mengambil jenis by kode
   */
  @Get('code/:code')
  async findByCode(@Param('code') code: string) {
    const jenis = await this.jenisService.findByCode(code);
    return {
      success: true,
      data: {
        id: jenis.id,
        jenis: jenis.jenis,
        jenis_text: jenis.jenisText,
        file_name: jenis.fileName,
        file_text: jenis.fileText,
        format_penomoran: jenis.formatPenomoran,
      },
    };
  }

  /**
   * POST /jenis
   * Membuat jenis baru dengan file upload
   * Form-data:
   * - jenis: string (kode jenis, required)
   * - jenis_text: string (nama jenis, required)
   * - file_text: string (optional)
   * - format_penomoran: string (optional)
   * - file: File (optional)
   */
  @Post()
  @RequirePermission('master-data', 'create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  async create(
    @Body() dto: CreateJenisDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const jenis = await this.jenisService.create(dto, file);
    const fileUrl = jenis.fileName ? await this.jenisService.getFileUrl(jenis.fileName) : null;
    
    return {
      success: true,
      message: 'Jenis berhasil dibuat',
      data: {
        id: jenis.id,
        jenis: jenis.jenis,
        jenis_text: jenis.jenisText,
        file_name: jenis.fileName,
        file_url: fileUrl,
        file_text: jenis.fileText,
        format_penomoran: jenis.formatPenomoran,
      },
    };
  }

  /**
   * GET /jenis/:id
   * Mengambil jenis by ID dengan file URL
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const jenis = await this.jenisService.findOne(id);
    const fileUrl = jenis.fileName ? await this.jenisService.getFileUrl(jenis.fileName) : null;
    
    return {
      success: true,
      data: {
        id: jenis.id,
        jenis: jenis.jenis,
        jenis_text: jenis.jenisText,
        file_name: jenis.fileName,
        file_url: fileUrl,
        file_text: jenis.fileText,
        format_penomoran: jenis.formatPenomoran,
      },
    };
  }

  /**
   * PUT /jenis/:id
   * Update jenis dengan optional file upload
   * Form-data:
   * - jenis: string (optional)
   * - jenis_text: string (optional)
   * - file_text: string (optional)
   * - format_penomoran: string (optional)
   * - file: File (optional)
   */
  @Put(':id')
  @RequirePermission('master-data', 'update')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateJenisDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const jenis = await this.jenisService.update(id, dto, file);
    const fileUrl = jenis.fileName ? await this.jenisService.getFileUrl(jenis.fileName) : null;
    
    return {
      success: true,
      message: 'Jenis berhasil diupdate',
      data: {
        id: jenis.id,
        jenis: jenis.jenis,
        jenis_text: jenis.jenisText,
        file_name: jenis.fileName,
        file_url: fileUrl,
        file_text: jenis.fileText,
        format_penomoran: jenis.formatPenomoran,
      },
    };
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
