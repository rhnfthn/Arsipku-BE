import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { NaskahService } from '../services/naskah.service';
import { CreateNaskahDto } from '../dto/naskah/create_naskah.dto';
import { UpdateNaskahDto } from '../dto/naskah/update_naskah.dto';
import { NaskahDetailResponseDto } from '../dto/naskah/naskah-detail.dto';
import { CountDraftNaskahResponseDto } from '../dto/count-draft.dto';

@Controller('persuratan/naskah')
export class NaskahController {
  constructor(private readonly naskahService: NaskahService) {}

  @Post()
  create(@Body() createNaskahDto: CreateNaskahDto) {
    return this.naskahService.create(createNaskahDto);
  }

  @Get()
  findAll(
    @Query('jenis') jenis?: string,
    @Query('status') status?: string,
    @Query('year') year?: number,
  ) {
    return this.naskahService.findAll(jenis, status, year);
  }

  @Get('jenis/:jenis')
  findByJenis(@Param('jenis') jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA') {
    return this.naskahService.findByJenis(jenis);
  }

  /**
   * Get Detail Naskah - Global untuk semua jenis naskah
   * Mengambil data lengkap: naskah, sirkulasi, lampiran, referensi, dan detail per jenis
   */
  @Get('detail/:id')
  getDetail(@Param('id') id: string): Promise<NaskahDetailResponseDto> {
    return this.naskahService.getDetail(id);
  }

  /**
   * GET /persuratan/naskah/count-draft/:positionId
   * Get count draft naskah berdasarkan position id
   */
  @Get('count-draft/:positionId')
  countDraft(
    @Param('positionId') positionId: string,
  ): Promise<CountDraftNaskahResponseDto> {
    return this.naskahService.countDraftByPosition(parseInt(positionId, 10));
  }

  /**
   * GET /persuratan/naskah/:id
   * Get Rangkaian Naskah Lengkap dari Awal sampai Akhir
   * 
   * Support semua jenis naskah (ND, SDI, SDE, DI, KA)
   * Menampilkan chain lengkap dengan referensi parent-child
   * 
   * Format mirip GET /DI/:id tapi universal untuk semua jenis
   * 
   * @param id - ID naskah (bisa dari level mana saja)
   * @returns Chain lengkap urutan terbaru → awal
   */
  @Get(':id')
  getDetailWithChain(@Param('id') id: string): Promise<any> {
    return this.naskahService.getDetailWithChain(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateNaskahDto: UpdateNaskahDto) {
    return this.naskahService.update(id, updateNaskahDto);
  }

  @Put(':id/status/:status')
  updateStatus(
    @Param('id') id: string,
    @Param('status') status: 'draf' | 'pending' | 'final' | 'final_tte',
  ) {
    return this.naskahService.updateStatus(id, status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.naskahService.remove(id);
  }
}
