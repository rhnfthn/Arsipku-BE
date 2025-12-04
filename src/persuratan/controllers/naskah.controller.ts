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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.naskahService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateNaskahDto: UpdateNaskahDto) {
    return this.naskahService.update(id, updateNaskahDto);
  }

  @Put(':id/status/:status')
  updateStatus(
    @Param('id') id: string,
    @Param('status') status: 'draf' | 'final' | 'final_tte',
  ) {
    return this.naskahService.updateStatus(id, status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.naskahService.remove(id);
  }
}
