import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { NaskahShareService } from '../services/naskah-share.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateNaskahShareDto, NaskahShareQueryDto } from '../dto';

@Controller('naskah-share')
export class NaskahShareController {
  private readonly logger = new Logger(NaskahShareController.name);
  constructor(private readonly shareService: NaskahShareService) {}

  /**
   * POST /naskah-share
   * Buat share baru (bagikan naskah)
   */
  @Post()
  @RequirePermission('naskah-share', 'create')
  async createShare(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateNaskahShareDto,
  ) {
    try {
      return await this.shareService.createShare(user, dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('[NaskahShareController] createShare error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Gagal membagikan naskah',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-share
   * List share (tab: shared-by-me / shared-to-me)
   */
  @Get()
  @RequirePermission('naskah-share', 'read')
  async getShares(
    @CurrentUser() user: JwtPayload,
    @Query() query: NaskahShareQueryDto,
  ) {
    try {
      return await this.shareService.getShares(user, query);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data share',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-share/search-user?q=...
   * Search user untuk dropdown penerima
   */
  @Get('search-user')
  @RequirePermission('naskah-share', 'read')
  async searchUsers(
    @CurrentUser() user: JwtPayload,
    @Query('q') query: string,
  ) {
    try {
      return await this.shareService.searchUsers(user, query);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: 'Gagal mencari user', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-share/:id
   * Detail share
   */
  @Get(':id')
  @RequirePermission('naskah-share', 'read')
  async getShareDetail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    try {
      return await this.shareService.getShareDetail(user, id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil detail share',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /naskah-share/:shareId/recipients/:recipientId
   * Cabut akses satu penerima
   */
  @Delete(':shareId/recipients/:recipientId')
  @RequirePermission('naskah-share', 'delete')
  async revokeRecipient(
    @CurrentUser() user: JwtPayload,
    @Param('shareId') shareId: string,
    @Param('recipientId') recipientId: string,
    @Query('reason') reason?: string,
  ) {
    try {
      return await this.shareService.revokeRecipient(
        user,
        shareId,
        recipientId,
        reason,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        '[NaskahShareController] revokeRecipient error:',
        error,
      );
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mencabut akses penerima',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /naskah-share/:id
   * Cabut akses share (semua penerima)
   */
  @Delete(':id')
  @RequirePermission('naskah-share', 'delete')
  async revokeShare(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    try {
      return await this.shareService.revokeShare(user, id, reason);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mencabut akses share',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /naskah-share/:id/open
   * Konfirmasi buka naskah (penerima)
   */
  @Post(':id/open')
  @RequirePermission('naskah-share', 'open')
  async openNaskah(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    try {
      return await this.shareService.openNaskah(user, id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal membuka naskah',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /naskah-share/:id/read
   * Tandai share sudah dibaca
   */
  @Patch(':id/read')
  @RequirePermission('naskah-share', 'read')
  async markAsRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    try {
      return await this.shareService.markAsRead(user, id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal menandai sudah dibaca',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

}
