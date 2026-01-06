import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RekapNaskahService } from '../services/rekap-naskah.service';
import {
  RekapNaskahQueryDto,
  RekapNaskahResponseDto,
} from '../dto/rekap-naskah.dto';
import {
  DetailNaskahQueryDto,
  DetailNaskahResponseDto,
} from '../dto/detail-naskah.dto';

@Controller('rekap-naskah')
export class RekapNaskahController {
  constructor(private readonly rekapNaskahService: RekapNaskahService) {}

  /**
   * GET /rekap-naskah
   * Mendapatkan rekap jumlah naskah dinas per jenis per bulan
   * 
   * Query Parameters:
   * - tahun: tahun rekap (default: tahun sekarang)
   * - area: filter berdasarkan area/lokasi (optional)
   * - status: filter berdasarkan status detail (default: 'terpakai')
   * - position: filter berdasarkan position (optional)
   */
  @Get()
  async getRekapNaskah(
    @Query() query: RekapNaskahQueryDto,
  ): Promise<RekapNaskahResponseDto> {
    try {
      return await this.rekapNaskahService.getRekapNaskah(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get rekap naskah dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /rekap-naskah/detail
   * Mendapatkan detail list naskah dinas yang sudah valid (terpakai)
   * 
   * Query Parameters:
   * - tahun: tahun filter (default: tahun sekarang)
   * - area: filter berdasarkan area/lokasi (optional)
   * - jenis: filter berdasarkan jenis surat (optional)
   * - status: filter berdasarkan status detail (default: 'terpakai')
   * - position: filter berdasarkan position (optional)
   * - search: search by nomor atau perihal (optional)
   * - page: halaman (default: 1)
   * - limit: jumlah per halaman (default: 20)
   */
  @Get('detail')
  async getDetailNaskah(
    @Query() query: DetailNaskahQueryDto,
  ): Promise<DetailNaskahResponseDto> {
    try {
      return await this.rekapNaskahService.getDetailNaskah(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get detail naskah dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
