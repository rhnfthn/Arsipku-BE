import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigMessageService } from '../services';
import { CreateMessageDto, UpdateMessageDto, ToggleBannerDto } from '../dto';
import { ConfigMessage } from '../entities';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles } from '../../../common/decorators';

/**
 * Admin Controller untuk konfigurasi Message
 * Endpoint: /admin/config/message
 */
@Controller('admin/config/message')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminConfigMessageController {
  constructor(private readonly configMessageService: ConfigMessageService) {}

  /**
   * GET /admin/config/message
   * Mengambil semua pesan
   */
  @Get()
  async findAll(): Promise<ConfigMessage[]> {
    return this.configMessageService.findAll();
  }

  /**
   * POST /admin/config/message
   * Membuat pesan baru
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMessageDto): Promise<ConfigMessage> {
    return this.configMessageService.create(dto);
  }

  /**
   * PUT /admin/config/message/upsert
   * Upsert pesan (update jika ada, create jika tidak)
   * NOTE: Static routes must come before parameterized routes
   */
  @Put('upsert')
  async upsert(@Body() dto: CreateMessageDto): Promise<ConfigMessage> {
    return this.configMessageService.upsert(dto);
  }

  /**
   * PATCH /admin/config/message/hide-all
   * Hide all banners
   * NOTE: Static routes must come before parameterized routes
   */
  @Patch('hide-all')
  @HttpCode(HttpStatus.OK)
  async hideAllBanners(): Promise<{ message: string }> {
    await this.configMessageService.hideAllBanners();
    return { message: 'Semua banner berhasil disembunyikan' };
  }

  /**
   * GET /admin/config/message/:id
   * Mengambil pesan berdasarkan ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ConfigMessage> {
    return this.configMessageService.findOne(id);
  }

  /**
   * PUT /admin/config/message/:id
   * Update pesan
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMessageDto,
  ): Promise<ConfigMessage> {
    return this.configMessageService.update(id, dto);
  }

  /**
   * PATCH /admin/config/message/:id/banner
   * Toggle show_banner
   * Body optional: jika tidak ada body, akan toggle current state
   * Jika ada body { show_banner: true/false }, akan set ke nilai tersebut
   */
  @Patch(':id/banner')
  async toggleBanner(
    @Param('id') id: string,
    @Body() dto?: ToggleBannerDto,
  ): Promise<ConfigMessage> {
    // Jika tidak ada body, toggle current state
    if (!dto || dto.show_banner === undefined) {
      const message = await this.configMessageService.findOne(id);
      return this.configMessageService.toggleBanner(id, { 
        show_banner: !message.showBanner 
      });
    }
    // Jika ada body, set ke nilai yang diberikan
    return this.configMessageService.toggleBanner(id, dto);
  }

  /**
   * PATCH /admin/config/message/:id/show
   * Show banner
   */
  @Patch(':id/show')
  async showBanner(@Param('id') id: string): Promise<ConfigMessage> {
    return this.configMessageService.showBanner(id);
  }

  /**
   * PATCH /admin/config/message/:id/hide
   * Hide banner
   */
  @Patch(':id/hide')
  async hideBanner(@Param('id') id: string): Promise<ConfigMessage> {
    return this.configMessageService.hideBanner(id);
  }

  /**
   * DELETE /admin/config/message/:id
   * Delete pesan
   */
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    return this.configMessageService.delete(id);
  }
}
