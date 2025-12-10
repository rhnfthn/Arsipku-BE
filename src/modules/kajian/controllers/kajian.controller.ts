import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { KajianService } from '../services/kajian.service';
import { UserLevelGuard } from '../../../common/guards';
import { UserLevels } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';
import { KajianRecipientResponseDto } from '../dto/kajian-recipient-response.dto';
import { CreateKajianDto } from '../dto/create-kajian.dto';
import { SendKajianResponseDto } from '../dto/send-kajian-response.dto';
import { GetSendKajianResponseDto } from '../dto/get-send-message-response.dto';
import {
  UpdateDraftKajianDto,
  UpdateDraftKajianResponseDto,
} from '../dto/update-draft-kajian.dto';
import {
  SendDraftKajianDto,
  SendDraftKajianResponseDto,
} from '../dto/send-draft-kajian.dto';

@Controller('KA')
export class KajianController {
  constructor(private readonly kajianService: KajianService) {}

  /**
   * GET /KA/get-recipient/:position_id
   * Get Kajian (KA) recipients for a sender
   * 
   * Kajian Rules:
   * - Sender: Semua (Managerial, Fungsional, Staff)
   * - Recipients: ATASAN saja (langsung & tidak langsung) dalam Sub Area yang sama
   * - BAWAHAN: [] (tidak boleh ke bawahan)
   * - REKAN: [] (tidak boleh ke sesama level)
   */
  @Get('get-recipient/:position_id')
  async getKajianRecipients(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<KajianRecipientResponseDto> {
    return this.kajianService.getKajianRecipients(positionId);
  }

  /**
   * POST /KA/send-message
   * Send Kajian message
   * 
   * Mengirim kajian ke ATASAN dalam Sub Area yang sama
   * Status langsung 'final'
   */
  @UseGuards(UserLevelGuard)
  @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('send-message')
  async sendMessage(@Body() dto: CreateKajianDto): Promise<SendKajianResponseDto> {
    return this.kajianService.sendMessage(dto);
  }

  /**
   * POST /KA/save-draft
   * Save Kajian as draft
   * 
   * Menyimpan kajian sebagai draft (status 'draf')
   * Bisa diedit/dikirim nanti
   */
  @UseGuards(UserLevelGuard)
  @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('save-draft')
  async saveDraft(@Body() dto: CreateKajianDto): Promise<SendKajianResponseDto> {
    return this.kajianService.saveDraft(dto);
  }

  /**
   * GET /KA/get-send-message/:position_id
   * Get list of sent Kajian messages
   * 
   * Mendapatkan daftar kajian yang sudah dikirimkan oleh position
   * Termasuk status baca dari penerima
   */
  @Get('get-send-message/:position_id')
  async getSendMessage(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<GetSendKajianResponseDto> {
    return this.kajianService.getSendMessage(positionId);
  }

  /**
   * PUT /KA/update-draft/:id_naskah
   * Update draft Kajian
   * 
   * Update kajian yang masih berstatus 'draf'
   * - action: 'simpan' → tetap draft
   * - action: 'kirim' → ubah ke final dan kirim
   */
  @UseGuards(UserLevelGuard)
  @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Put('update-draft/:id_naskah')
  async updateDraft(
    @Param('id_naskah') idNaskah: string,
    @Body() dto: UpdateDraftKajianDto,
  ): Promise<UpdateDraftKajianResponseDto> {
    return this.kajianService.updateDraft(idNaskah, dto);
  }

  /**
   * PUT /KA/send-draft/:id_naskah
   * Send draft Kajian (convert to final)
   * 
   * Mengirimkan kajian yang sebelumnya disimpan sebagai draft
   * Status berubah dari 'draf' ke 'final'
   */
  @UseGuards(UserLevelGuard)
  @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Put('send-draft/:id_naskah')
  async sendDraft(
    @Param('id_naskah') idNaskah: string,
    @Body() dto: SendDraftKajianDto,
  ): Promise<SendDraftKajianResponseDto> {
    return this.kajianService.sendDraft(idNaskah, dto);
  }
}
