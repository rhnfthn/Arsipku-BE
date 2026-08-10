import {
  Controller,
  Get,
  Post,
  Delete,
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

  /** POST /naskah-share — Create share (single or multi naskah) */
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

  /** GET /naskah-share — List shares (tab: shared-by-me | shared-to-me) */
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

  /** GET /naskah-share/unread-count — Jumlah share diterima yang belum dibaca */
  @Get('unread-count')
  @RequirePermission('naskah-share', 'read')
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    try {
      const count = await this.shareService.getUnreadCount(user);
      return { success: true, data: { count } };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil jumlah share belum dibaca',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** GET /naskah-share/search-user?q=... — Search user for recipient dropdown */
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

  /** GET /naskah-share/:id — Share detail (with auto-expire check) */
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

  /** DELETE /naskah-share/:shareId/recipients/:recipientId — Revoke single recipient */
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

  /** DELETE /naskah-share/:id — Revoke entire share (all recipients) */
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

  /** POST /naskah-share/:id/open — Open naskah (returns PDF URL, SEKALI_LIHAT auto-revoke) */
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

}
