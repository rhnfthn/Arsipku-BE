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
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PedomanService } from '../services/pedoman.service';
import { CreatePedomanDto } from '../dto/create-pedoman.dto';
import { UpdatePedomanDto } from '../dto/update-pedoman.dto';
import { PedomanResponseDto } from '../dto/pedoman.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles } from '../../../common/decorators';

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
  constructor(private readonly pedomanService: PedomanService) {}

  /**
   * GET /pedoman
   * Mendapatkan semua pedoman, opsional filter berdasarkan jenis dan search.
   * Akses: semua user (JWT required)
   *
   * Query:
   *  ?jenis=Peraturan Direksi|Keputusan Direksi|SOP Kearsipan
   *  ?search=kata+kunci
   *  ?includeInactive=true  (hanya super admin)
   */
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

  /**
   * GET /pedoman/:id
   * Mendapatkan pedoman berdasarkan ID.
   * Akses: semua user (JWT required)
   */
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

  /**
   * POST /pedoman
   * Membuat pedoman baru.
   * Akses: khusus super admin
   */
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

  /**
   * PATCH /pedoman/:id
   * Memperbarui pedoman berdasarkan ID.
   * Akses: khusus super admin
   */
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

  /**
   * DELETE /pedoman/:id
   * Menghapus pedoman berdasarkan ID.
   * Akses: khusus super admin
   */
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

  /**
   * POST /pedoman/upload-lampiran
   * Upload file lampiran (image/pdf) untuk pedoman.
   * File disimpan ke MinIO di folder pedoman/lampiran.
   * Akses: khusus admin/superadmin
   *
   * Form-data:
   *  - lampiran: file (single file, max 10MB)
   *
   * Response:
   * {
   *   success: true,
   *   data: {
   *     lampiranUrl: "pedoman/lampiran/1234567890-filename.jpg",
   *     lampiranName: "filename.jpg",
   *     previewUrl: "pedoman/lampiran/1234567890-filename.jpg"
   *   }
   * }
   */
  @Post('upload-lampiran')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @UseInterceptors(
    FileInterceptor('lampiran', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new HttpException(
              {
                success: false,
                message: `Tipe file ${file.mimetype} tidak didukung. Gunakan gambar (JPG/PNG/GIF/WebP) atau dokumen (PDF/DOC/DOCX/XLS/XLSX).`,
              },
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadLampiran(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean; data: any }> {
    try {
      if (!file) {
        throw new HttpException(
          {
            success: false,
            message: 'Tidak ada file yang diupload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.pedomanService.uploadLampiran(file);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengupload lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /pedoman/preview-lampiran/*
   * Preview lampiran file directly from storage
   */
  @Get('preview-lampiran/*')
  @UseGuards(JwtAuthGuard)
  async previewLampiran(
    @Param('0') path: string,
    @Res() res: any,
  ) {
    try {
      const url = await this.pedomanService.getLampiranPreviewUrl(path);
      return res.redirect(url);
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mendapatkan url preview lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}