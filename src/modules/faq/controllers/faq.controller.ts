import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Res,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FaqService } from '../services/faq.service';
import { CreateFaqDto } from '../dto/create-faq.dto';
import { UpdateFaqDto } from '../dto/update-faq.dto';
import { FaqResponseDto } from '../dto/faq.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles, Public } from '../../../common/decorators';
import { StorageService } from '../../storage/services/storage.service';
import type { Response } from 'express';

@Controller('faq')
export class FaqController {
  constructor(
    private readonly faqService: FaqService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * GET /faq
   * Mendapatkan semua FAQ, opsional filter berdasarkan kategori dan search
   * Query: ?kategoriId=<uuid>
   * Query: ?search=kata+kunci
   */
  @Get()
  async findAll(
    @Query('kategoriId') kategoriId?: string,
    @Query('search') search?: string,
  ): Promise<FaqResponseDto> {
    try {
      return await this.faqService.findAll(kategoriId, search);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data FAQ',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /faq/preview-lampiran?path=xxx
   * Preview/stream file lampiran FAQ langsung dari MinIO.
   * Akses: PUBLIC (tanpa JWT) — agar <img> dan <a> tag bisa langsung mengakses.
   */
  @Get('preview-lampiran')
  @Public()
  async previewLampiran(
    @Query('path') path: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!path) {
        throw new HttpException(
          { success: false, message: 'Parameter path wajib diisi' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validasi: hanya izinkan akses file dari folder faq/
      if (!path.startsWith('faq/') || path.includes('..')) {
        throw new HttpException(
          { success: false, message: 'Akses ditolak: path tidak valid' },
          HttpStatus.FORBIDDEN,
        );
      }

      const fileBuffer = await this.storageService.getFile(path);

      const extension = path.split('.').pop()?.toLowerCase();
      let contentType = 'application/octet-stream';

      if (extension === 'pdf') {
        contentType = 'application/pdf';
      } else if (['jpg', 'jpeg'].includes(extension || '')) {
        contentType = 'image/jpeg';
      } else if (extension === 'png') {
        contentType = 'image/png';
      } else if (extension === 'gif') {
        contentType = 'image/gif';
      } else if (extension === 'webp') {
        contentType = 'image/webp';
      } else if (extension === 'svg') {
        contentType = 'image/svg+xml';
      }

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${path.split('/').pop()}"`,
        'Content-Length': fileBuffer.length,
        'Cache-Control': 'public, max-age=3600',
      });

      res.status(HttpStatus.OK).send(fileBuffer);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal memuat lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /faq/upload-lampiran
   * Upload multiple file lampiran ke MinIO (path: faq/lampiran).
   * Akses: admin & super admin
   */
  @Post('upload-lampiran')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @UseInterceptors(
    FilesInterceptor('lampirans', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/svg+xml',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new HttpException(
            { success: false, message: `Tipe file tidak diizinkan: ${file.mimetype}` },
            HttpStatus.BAD_REQUEST,
          ), false);
        }
      },
    }),
  )
  async uploadLampiran(@UploadedFiles() files: Express.Multer.File[]): Promise<any> {
    try {
      if (!files || files.length === 0) {
        throw new HttpException(
          { success: false, message: 'File tidak ditemukan' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const lampirans = await Promise.all(
        files.map(async (file) => {
          const uploadResult = await this.storageService.uploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            'faq/lampiran',
          );
          return {
            url: uploadResult.key,
            name: file.originalname,
          };
        }),
      );

      return {
        success: true,
        data: { lampirans },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengunggah lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /faq/:id
   * Mendapatkan FAQ berdasarkan ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<FaqResponseDto> {
    try {
      return await this.faqService.findOne(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data FAQ',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /faq
   * Membuat FAQ baru
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async create(@Body() dto: CreateFaqDto): Promise<FaqResponseDto> {
    try {
      return await this.faqService.create(dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal membuat FAQ',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /faq/:id
   * Memperbarui FAQ berdasarkan ID
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFaqDto,
  ): Promise<FaqResponseDto> {
    try {
      return await this.faqService.update(id, dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal memperbarui FAQ',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /faq/:id
   * Menghapus FAQ berdasarkan ID
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async remove(@Param('id') id: string): Promise<FaqResponseDto> {
    try {
      return await this.faqService.remove(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal menghapus FAQ',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /faq/:id/puas
   * Menambah counter "puas" pada FAQ (per user, satu kali)
   */
  @Post(':id/puas')
  async incrementPuas(
    @Param('id') id: string,
    @CurrentUser('persnum') userId: number,
  ): Promise<FaqResponseDto> {
    try {
      return await this.faqService.incrementPuas(id, String(userId));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mencatat feedback puas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /faq/:id/tidak-puas
   * Menambah counter "tidak puas" pada FAQ (per user, satu kali)
   */
  @Post(':id/tidak-puas')
  async incrementTidakPuas(
    @Param('id') id: string,
    @CurrentUser('persnum') userId: number,
  ): Promise<FaqResponseDto> {
    try {
      return await this.faqService.incrementTidakPuas(id, String(userId));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mencatat feedback tidak puas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
