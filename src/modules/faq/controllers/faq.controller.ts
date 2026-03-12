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
} from '@nestjs/common';
import { FaqService } from '../services/faq.service';
import { CreateFaqDto } from '../dto/create-faq.dto';
import { UpdateFaqDto } from '../dto/update-faq.dto';
import { FaqResponseDto } from '../dto/faq.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

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
