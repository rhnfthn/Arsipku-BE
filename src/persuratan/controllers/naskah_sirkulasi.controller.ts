import {
  Controller,
  Get,
  Post,
  Body,
  Put,
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
   * @param query - Filter options (jenis, status_baca, page, limit)
   * @returns InboxResponseDto
   *
   * @example
   * GET /naskah_sirkulasi/inbox/123?jenis=DI&status_baca=belum_terbaca&page=1&limit=10
   */
  @Get('inbox/:position_id')
  async getInbox(
    @Param('position_id') positionId: string,
    @Query() query: InboxQueryDto,
  ): Promise<InboxResponseDto> {
    return this.naskahSirkulasiService.getInbox(positionId, query);
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
