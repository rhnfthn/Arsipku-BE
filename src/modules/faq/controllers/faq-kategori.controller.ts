import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FaqKategoriService } from '../services/faq-kategori.service';
import { CreateFaqKategoriDto } from '../dto/create-faq-kategori.dto';
import { UpdateFaqKategoriDto } from '../dto/update-faq-kategori.dto';
import { FaqKategoriResponseDto } from '../dto/faq-kategori.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles } from '../../../common/decorators';

@Controller('faq-kategori')
export class FaqKategoriController {
  constructor(private readonly kategoriService: FaqKategoriService) {}

  /**
   * GET /faq-kategori
   * Mendapatkan semua kategori FAQ
   */
  @Get()
  async findAll(): Promise<FaqKategoriResponseDto> {
    try {
      return await this.kategoriService.findAll();
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data kategori',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /faq-kategori/:id
   * Mendapatkan kategori berdasarkan ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<FaqKategoriResponseDto> {
    try {
      return await this.kategoriService.findOne(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data kategori',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /faq-kategori
   * Membuat kategori baru
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async create(
    @Body() dto: CreateFaqKategoriDto,
  ): Promise<FaqKategoriResponseDto> {
    try {
      return await this.kategoriService.create(dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal membuat kategori',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /faq-kategori/:id
   * Update kategori berdasarkan ID
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFaqKategoriDto,
  ): Promise<FaqKategoriResponseDto> {
    try {
      return await this.kategoriService.update(id, dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengupdate kategori',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /faq-kategori/:id
   * Hapus kategori berdasarkan ID
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async remove(@Param('id') id: string): Promise<FaqKategoriResponseDto> {
    try {
      return await this.kategoriService.remove(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal menghapus kategori',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
