// ============================================================
// CONTROLLER: PedomanController
// Endpoint HTTP untuk fitur Pedoman.
// Base path: /pedoman
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PedomanService } from '../services/pedoman.service';
import { CreatePedomanDto } from '../dto/create-pedoman.dto';
import { UpdatePedomanDto } from '../dto/update-pedoman.dto';
import { PedomanResponseDto } from '../dto/pedoman.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles, Public } from '../../../common/decorators';
import { StorageService } from '../../storage/services/storage.service';
import type { Response } from 'express';

/**
 * Controller untuk fitur Pedoman.
 *
 * Fitur Pedoman menampilkan Peraturan Direksi, Keputusan Direksi, dan SOP
 * tentang Kearsipan yang ada di lingkungan Perum LPPNPI.
 *
 * Akses:
 *  - GET (read): semua user yang sudah login
 *  - POST / PATCH / DELETE (CRUD): khusus super admin
 */
@Controller('pedoman')
export class PedomanController {
  constructor(
    private readonly pedomanService: PedomanService,
    private readonly storageService: StorageService,
  ) {}

  // ================================================================
  //  ENDPOINT READ: GET /pedoman — List semua pedoman (dengan filter)
  //  Akses: semua user login
  // ================================================================
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query('jenis') jenis?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<PedomanResponseDto> {
    try {
      return await this.pedomanService.findAll(
        jenis,
        search,
        includeInactive === 'true',
      );
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data pedoman',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ================================================================
  //  ENDPOINT: GET /pedoman/preview-lampiran — Stream file dari MinIO
  //  Akses: PUBLIC (tanpa JWT, agar <img>/<a> bisa langsung akses)
  // ================================================================
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

      // Validasi: hanya izinkan akses file dari folder pedoman/
      if (!path.startsWith('pedoman/') || path.includes('..')) {
        throw new HttpException(
          { success: false, message: 'Akses ditolak: path tidak valid' },
          HttpStatus.FORBIDDEN,
        );
      }

      // Get file buffer from MinIO
      const fileBuffer = await this.storageService.getFile(path);

      // Determine content type based on file extension
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

      // Set headers for inline preview (not download)
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

  // ================================================================
  //  ENDPOINT UPLOAD: POST /pedoman/upload-lampiran — Upload file ke MinIO
  //  Akses: admin & superadmin
  // ================================================================
  @Post('upload-lampiran')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @UseInterceptors(
    FilesInterceptor('lampirans', 10, {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
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

      // Upload all files directly to MinIO object storage (path: pedoman/lampiran)
      const lampirans = await Promise.all(
        files.map(async (file) => {
          const uploadResult = await this.storageService.uploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            'pedoman/lampiran',
          );
          return {
            url: uploadResult.key,
            name: file.originalname,
          };
        }),
      );

      return {
        success: true,
        data: {
          lampirans,
        },
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

  // ================================================================
  //  ENDPOINT READ: GET /pedoman/:id — Get pedoman by ID
  //  Akses: semua user login
  // ================================================================
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string): Promise<PedomanResponseDto> {
    try {
      return await this.pedomanService.findOne(id);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data pedoman',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ================================================================
  //  ENDPOINT CREATE: POST /pedoman — Buat pedoman baru
  //  Akses: admin & superadmin
  // ================================================================
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async create(@Body() dto: CreatePedomanDto): Promise<PedomanResponseDto> {
    try {
      return await this.pedomanService.create(dto);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal membuat pedoman',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ================================================================
  //  ENDPOINT UPDATE: PATCH /pedoman/:id — Update pedoman
  //  Akses: admin & superadmin
  // ================================================================
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePedomanDto,
  ): Promise<PedomanResponseDto> {
    try {
      return await this.pedomanService.update(id, dto);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal memperbarui pedoman',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ================================================================
  //  ENDPOINT DELETE: DELETE /pedoman/:id — Hapus pedoman (hard delete)
  //  Akses: admin & superadmin
  // ================================================================
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async remove(@Param('id') id: string): Promise<PedomanResponseDto> {
    try {
      return await this.pedomanService.remove(id);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal menghapus pedoman',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}