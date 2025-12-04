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
} from '../dto/naskah_sirkulasi/toggle-flag.dto';
import { NaskahSirkulasi } from '../entity/naskah_sirkulasi.entity';

@Controller('naskah_sirkulasi')
export class NaskahSirkulasiController {
  constructor(
    private readonly naskahSirkulasiService: NaskahSirkulasiService,
  ) {}

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
   * GET /naskah_sirkulasi/inbox/:position_id
   *
   * Mengambil kotak masuk untuk position tertentu
   * Join dengan tabel naskah untuk mendapatkan jenis, perihal, dll
   *
   * @param positionId - Position ID penerima
   * @param query - Filter options (jenis, status_baca)
   * @returns InboxResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/inbox/123?jenis=DI&status_baca=belum_terbaca
   */
  @Get('inbox/:position_id')
  async getInbox(
    @Param('position_id') positionId: string,
    @Query() query: InboxQueryDto,
  ): Promise<InboxResponseDto> {
    return this.naskahSirkulasiService.getInbox(positionId, query);
  }

  // ============================================================
  // SENT MESSAGE - Kotak Keluar (Global untuk semua jenis naskah)
  // ============================================================

  /**
   * GET /naskah_sirkulasi/sent/:position_id
   *
   * Mengambil kotak keluar (pesan terkirim) untuk position tertentu
   * Termasuk status baca per penerima
   *
   * @param positionId - Position ID pengirim
   * @param query - Filter options (jenis, status_baca)
   * @returns SentMessageResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/sent/123
   * GET /naskah_sirkulasi/sent/123?jenis=DI
   * GET /naskah_sirkulasi/sent/123?status_baca=belum_terbaca
   */
  @Get('sent/:position_id')
  async getSentMessage(
    @Param('position_id') positionId: string,
    @Query() query: SentMessageQueryDto,
  ): Promise<SentMessageResponseDto> {
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
