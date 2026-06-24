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
import { ApiBearerAuth } from '@nestjs/swagger';
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
  TertundaQueryDto,
  TertundaResponseDto,
} from '../dto/naskah_sirkulasi/tertunda.dto';
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
   * @param query - Filter options (jenis, status_baca, favorite, tinjut, lock, note, arsip)
   * @returns InboxResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/inbox?jenis=DI&status_baca=belum_terbaca
   * GET /naskah_sirkulasi/inbox?favorite=true
   * GET /naskah_sirkulasi/inbox?tinjut=sudah_tinjut&lock=true
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
   * GET /naskah_sirkulasi/inbox/:idNaskah/navigation
   *
   * Ambil naskah previous & next dari sebuah naskah di kotak masuk user.
   * Hanya naskah yang user punya akses (penerima/tembusan) yang dikembalikan.
   *
   * @param user       - User dari JWT token (contains position)
   * @param idNaskah   - ID naskah acuan
   * @param jenis      - Optional filter jenis (ND, SDI, SDE, DI, KA, K)
   *
   * @example
   * GET /naskah_sirkulasi/inbox/abc-123/navigation
   * GET /naskah_sirkulasi/inbox/abc-123/navigation?jenis=ND
   */
  @UseGuards(JwtAuthGuard)
  @Get('inbox/:idNaskah/navigation')
  async getInboxNavigation(
    @CurrentUser() user: any,
    @Param('idNaskah') idNaskah: string,
    @Query('jenis') jenis?: string,
  ) {
    const positionId = user.position;
    return this.naskahSirkulasiService.getInboxNavigation(
      positionId,
      idNaskah,
      jenis,
    );
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
  // TERTUNDA - Surat Tertunda / Pending TTD Basah
  // ============================================================

  /**
   * GET /naskah_sirkulasi/tertunda
   *
   * Mengambil daftar surat tertunda (pending TTD basah) untuk position pengirim (dari JWT token)
   * Naskah dengan status 'pending' yang belum dikirim ke penerima
   */
  @UseGuards(JwtAuthGuard)
  @Get('tertunda')
  async getTertunda(
    @CurrentUser() user: any,
    @Query() query: TertundaQueryDto,
  ): Promise<TertundaResponseDto> {
    const positionId = user.position;
    return this.naskahSirkulasiService.getTertunda(positionId, query);
  }

  /**
   * GET /naskah_sirkulasi/tertunda-count
   *
   * Menampilkan jumlah surat tertunda (dari JWT token)
   */
  @UseGuards(JwtAuthGuard)
  @Get('tertunda-count')
  async countTertunda(
    @CurrentUser() user: any,
  ): Promise<{ total: number }> {
    const positionId = user.position;
    return this.naskahSirkulasiService.countTertunda(positionId);
  }

  /**
   * GET /naskah_sirkulasi/tertunda/:idNaskah/navigation
   *
   * Ambil naskah previous & next dari sebuah naskah di daftar tertunda user.
   * Hanya naskah tertunda (pengirim, is_draft=1, status=pending) yang dikembalikan.
   *
   * @example
   * GET /naskah_sirkulasi/tertunda/abc-123/navigation
   * GET /naskah_sirkulasi/tertunda/abc-123/navigation?jenis=ND
   */
  @UseGuards(JwtAuthGuard)
  @Get('tertunda/:idNaskah/navigation')
  async getTertundaNavigation(
    @CurrentUser() user: any,
    @Param('idNaskah') idNaskah: string,
    @Query('jenis') jenis?: string,
  ) {
    const positionId = user.position;
    return this.naskahSirkulasiService.getTertundaNavigation(
      positionId,
      idNaskah,
      jenis,
    );
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

  /**
   * GET /naskah_sirkulasi/sent/:idNaskah/navigation
   *
   * Ambil naskah previous & next dari sebuah naskah di kotak keluar (terkirim) user.
   * Hanya naskah yang user kirim (pengirim, final/final_tte) yang dikembalikan.
   *
   * @example
   * GET /naskah_sirkulasi/sent/abc-123/navigation
   * GET /naskah_sirkulasi/sent/abc-123/navigation?jenis=ND
   */
  @UseGuards(JwtAuthGuard)
  @Get('sent/:idNaskah/navigation')
  async getSentNavigation(
    @CurrentUser() user: any,
    @Param('idNaskah') idNaskah: string,
    @Query('jenis') jenis?: string,
  ) {
    const positionId = user.position;
    return this.naskahSirkulasiService.getSentNavigation(
      positionId,
      idNaskah,
      jenis,
    );
  }

  // ============================================================
  // TOGGLE FLAG - Favorit, Note, Arsip (Global untuk semua naskah)
  // ============================================================

  /**
   * PATCH /naskah_sirkulasi/toggle-flag
   *
   * Toggle atau hapus flag (favorit, note, arsip) pada item surat
   * Global untuk semua jenis naskah: ND, SDI, SDE, DI, KA
   *
   * @param dto - ToggleFlagDto { id_sirkulasi, flag_type, action? }
   * @returns ToggleFlagResponseDto
   *
   * @example
   * Toggle: PATCH /naskah_sirkulasi/toggle-flag
   * Body: { "id_sirkulasi": "uuid-xxx", "flag_type": "favorit" }
   * 
   * Delete: PATCH /naskah_sirkulasi/toggle-flag
   * Body: { "id_sirkulasi": "uuid-xxx", "flag_type": "favorit", "action": "delete" }
   */
  @Patch('toggle-flag')
  @HttpCode(HttpStatus.OK)
  async toggleFlag(
    @Body() dto: ToggleFlagDto,
  ): Promise<ToggleFlagResponseDto> {
    return this.naskahSirkulasiService.toggleFlag(
      dto.id_sirkulasi,
      dto.flag_type,
      dto.action,
      dto.note_text,
    );
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

  // ============================================================
  // CRUD OPERATIONS - MUST BE LAST!
  // ============================================================
  // IMPORTANT: The @Get(':id') route must be placed AFTER all named routes
  // like 'inbox-sent', 'toggle-flag', etc. Otherwise, NestJS will match
  // 'inbox-sent' as an :id parameter and call findOne() instead of the
  // correct handler. This caused the 404 error on remote deployment.

  @Get()
  findAll(): Promise<NaskahSirkulasi[]> {
    return this.naskahSirkulasiService.findAll();
  }

  @Post()
  create(@Body() data: CreateNaskahSirkulasiDto) {
    return this.naskahSirkulasiService.create(data);
  }

  // IMPORTANT: This must be the LAST @Get() route in this controller!
  @Get(':id')
  findOne(@Param('id') id: string): Promise<NaskahSirkulasi> {
    return this.naskahSirkulasiService.findOne(id);
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
