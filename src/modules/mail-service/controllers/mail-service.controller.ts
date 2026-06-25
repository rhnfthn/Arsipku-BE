import { Controller, Post, Get, Body, Query, HttpStatus, HttpException } from '@nestjs/common';
import { MailServiceService } from '../services';
import { SendMailDto } from '../dto';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('mail-service')
export class MailServiceController {
  constructor(private readonly mailService: MailServiceService) {}

  /**
   * GET /mail-service/logs?page=1&limit=20&status=success
   * Ambil log email dengan pagination
   */
  @Get('logs')
  async getLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    try {
      const p = page ? parseInt(page, 10) : 1;
      const l = limit ? parseInt(limit, 10) : 20;
      return await this.mailService.getLogs(p, l, status);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /mail-service/send
   * Kirim email dengan lampiran dari URL
   */
  @Post('send')
  async sendMail(
    @Body() dto: SendMailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      const result = await this.mailService.sendMail(dto, user.persnum, {
        sender_persnum: String(user.persnum),
        sender_nama: user.nama,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /mail-service/send-base64
   * Kirim email dengan lampiran base64
   */
  @Post('send-base64')
  async sendMailBase64(
    @Body() dto: SendMailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      const result = await this.mailService.sendMailBase64(dto, user.persnum, {
        sender_persnum: String(user.persnum),
        sender_nama: user.nama,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /mail-service/draft
   * Simpan draft email
   */
  @Post('draft')
  async saveDraft(
    @Body() dto: SendMailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      const result = await this.mailService.saveDraft(dto, user.persnum, {
        sender_persnum: String(user.persnum),
        sender_nama: user.nama,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}