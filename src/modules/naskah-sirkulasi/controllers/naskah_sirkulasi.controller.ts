import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NaskahSirkulasiService } from '../services/naskah_sirkulasi.service';
import { CreateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/create_naskah_sirkulasi.dto';
import { UpdateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/update_naskah_sirkulasi.dto';
import {
  UpdateReadStatusDto,
  UpdateReadStatusResponseDto,
} from '../dto/naskah_sirkulasi/update-read-status.dto';
import {
  InboxQueryDto,
  InboxResponseDto,
} from '../dto/naskah_sirkulasi/inbox.dto';
import {
  SentMessageQueryDto,
  SentMessageResponseDto,
} from '../dto/naskah_sirkulasi/sent-message.dto';
import {
  ToggleFlagDto,
  ToggleFlagResponseDto,
  BulkArchiveSentDto,
  BulkArchiveSentResponseDto,
} from '../dto/naskah_sirkulasi/toggle-flag.dto';
import { CountUnreadInboxResponseDto } from '../dto/count-unread-inbox.dto';
import { InboxSentResponseDto, InboxSentQueryDto } from '../dto/naskah_sirkulasi/inbox-sent.dto';
import { NaskahSirkulasi } from '../entities/naskah_sirkulasi.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators';

@Controller('naskah_sirkulasi')
export class NaskahSirkulasiController {
  constructor(
    private readonly naskahSirkulasiService: NaskahSirkulasiService,
  ) { }

  // ============================================================
  // GLOBAL: Update Read Status (harus di atas route :id)
  // ============================================================

  /**
   * PUT /naskah_sirkulasi/update-read-status
   *
   * Update status baca pesan (global untuk semua jenis naskah)
   * Bisa dipakai untuk: ND, DI, SDI, SDE, dll
   *
   * @param dto - UpdateReadStatusDto { id_naskah, position_id, user_id? }
   * @returns UpdateReadStatusResponseDto
   */
  @Put('update-read-status')
  @HttpCode(HttpStatus.OK)
  async updateReadStatus(
    @Body() dto: UpdateReadStatusDto,
  ): Promise<UpdateReadStatusResponseDto> {
    return this.naskahSirkulasiService.updateReadStatus(dto);
  }

  // ============================================================
  // INBOX - Kotak Masuk
  // ============================================================

  /**
   * GET /naskah_sirkulasi/inbox
   *
   * Mengambil kotak masuk untuk position tertentu (dari JWT token)
   * Join dengan tabel naskah untuk mendapatkan jenis, perihal, dll
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Filter options (jenis, status_baca)
   * @returns InboxResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/inbox?jenis=DI&status_baca=belum_terbaca
   */
  @UseGuards(JwtAuthGuard)
  @Get('inbox')
  async getInbox(
    @CurrentUser() user: any,
    @Query() query: InboxQueryDto,
  ): Promise<InboxResponseDto> {
    const positionId = user.position;
    return this.naskahSirkulasiService.getInbox(positionId, query);
  }

  /**
   * GET /naskah_sirkulasi/inbox-count
   *
   * Menampilkan jumlah kotak masuk yang belum dibaca (dari JWT token)
   *
   * @param user - User dari JWT token (contains position)
   * @returns CountUnreadInboxResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/inbox-count
   */
  @UseGuards(JwtAuthGuard)
  @Get('inbox-count')
  async countUnreadInbox(
    @CurrentUser() user: any,
  ): Promise<CountUnreadInboxResponseDto> {
    const positionId = user.position;
    return this.naskahSirkulasiService.countUnreadInbox(positionId);
  }

  /**
   * GET /naskah_sirkulasi/inbox-sent
   *
   * Mengambil kotak masuk dan kotak keluar sekaligus (dari JWT token)
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Filter options
   * @returns InboxSentResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('inbox-sent')
  async getInboxAndSent(
    @CurrentUser() user: any,
    @Query() query: InboxSentQueryDto,
  ): Promise<InboxSentResponseDto> {
    const positionId = user.position;
    return this.naskahSirkulasiService.getInboxAndSent(positionId, query);
  }

  // ============================================================
  // SENT MESSAGE - Kotak Keluar (Global untuk semua jenis naskah)
  // ============================================================

  /**
   * GET /naskah_sirkulasi/sent
   *
   * Mengambil kotak keluar (pesan terkirim) untuk position tertentu (dari JWT token)
   * Termasuk status baca per penerima
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Filter options (jenis, status_baca)
   * @returns SentMessageResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/sent
   * GET /naskah_sirkulasi/sent?jenis=DI
   * GET /naskah_sirkulasi/sent?status_baca=belum_terbaca
   */
  @UseGuards(JwtAuthGuard)
  @Get('sent')
  async getSentMessage(
    @CurrentUser() user: any,
    @Query() query: SentMessageQueryDto,
  ): Promise<SentMessageResponseDto> {
    const positionId = user.position;
    return this.naskahSirkulasiService.getSentMessage(positionId, query);
  }

  // ============================================================
  // TOGGLE FLAG - Favorit, Note, Arsip (Global untuk semua naskah)
  // ============================================================

  /**
   * PATCH /naskah_sirkulasi/toggle-flag
   *
   * Toggle flag (favorit, note, arsip) pada item surat
   * Global untuk semua jenis naskah: ND, SDI, SDE, DI, KA
   *
   * @param dto - ToggleFlagDto { id_sirkulasi, flag_type }
   * @returns ToggleFlagResponseDto
   *
   * @example
   * PATCH /naskah_sirkulasi/toggle-flag
   * Body: { "id_sirkulasi": "uuid-xxx", "flag_type": "favorit" }
   */
  @Patch('toggle-flag')
  @HttpCode(HttpStatus.OK)
  async toggleFlag(
    @Body() dto: ToggleFlagDto,
  ): Promise<ToggleFlagResponseDto> {
    return this.naskahSirkulasiService.toggleFlag(dto.id_sirkulasi, dto.flag_type);
  }

  // ============================================================
  // BULK ARCHIVE/DELETE SENT - Bulk archive atau delete pesan terkirim
  // ============================================================

  /**
   * POST /naskah_sirkulasi/sent/bulk-action
   *
   * Bulk archive atau delete pesan terkirim
   * Archive: Set flag_arsip = 1 (pesan masih ada tapi dipindahkan ke arsip)
   * Delete: Hapus pesan beserta semua data terkait secara permanen
   *
   * @param dto - BulkArchiveSentDto { position_id, naskah_ids, action }
   * @returns BulkArchiveSentResponseDto
   *
   * @example
   * POST /naskah_sirkulasi/sent/bulk-action
   * Body: { 
   *   "position_id": 123,
   *   "naskah_ids": ["uuid-1", "uuid-2", "uuid-3"],
   *   "action": "archive" | "delete"
   * }
   */
  @Post('sent/bulk-action')
  @HttpCode(HttpStatus.OK)
  async bulkArchiveOrDeleteSent(
    @Body() dto: BulkArchiveSentDto,
  ): Promise<BulkArchiveSentResponseDto> {
    return this.naskahSirkulasiService.bulkArchiveOrDeleteSent(
      dto.naskah_ids,
      dto.position_id,
      dto.action,
    );
  }

  @Get()
  findAll(): Promise<NaskahSirkulasi[]> {
    return this.naskahSirkulasiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<NaskahSirkulasi> {
    return this.naskahSirkulasiService.findOne(id);
  }

  @Post()
  create(@Body() data: CreateNaskahSirkulasiDto) {
    return this.naskahSirkulasiService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: UpdateNaskahSirkulasiDto) {
    return this.naskahSirkulasiService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.naskahSirkulasiService.remove(id);
  }
}
