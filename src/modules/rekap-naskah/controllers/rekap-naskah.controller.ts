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
import {
  NaskahMasukQueryDto,
  NaskahMasukResponseDto,
} from '../dto/naskah-masuk.dto';
import {
  DetailNaskahMasukQueryDto,
  DetailNaskahMasukResponseDto,
} from '../dto/detail-naskah-masuk.dto';

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

  /**
   * GET /rekap-naskah/naskah-masuk
   * Mendapatkan rekap naskah masuk per jenis per bulan
   * Menampilkan semua data jenis naskah dari nomor_request_detail
   * 
   * Query Parameters:
   * - tahun: tahun rekap (default: tahun sekarang)
   * - bulan: bulan rekap 1-12 (optional, jika tidak diisi tampilkan semua bulan)
   * - area: filter berdasarkan area/lokasi (optional)
   * - jenis: filter berdasarkan jenis surat (optional)
   * - klasifikasi: filter berdasarkan klasifikasi (optional)
   */
  @Get('naskah-masuk')
  async getNaskahMasuk(
    @Query() query: NaskahMasukQueryDto,
  ): Promise<NaskahMasukResponseDto> {
    try {
      return await this.rekapNaskahService.getNaskahMasuk(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get naskah masuk',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /rekap-naskah/naskah-masuk/detail
   * Mendapatkan detail list naskah masuk
   * 
   * Query Parameters:
   * - tahun: tahun filter (default: tahun sekarang)
   * - bulan: bulan filter 1-12 (optional)
   * - area: filter berdasarkan area/lokasi (optional)
   * - jenis: filter berdasarkan jenis surat (optional)
   * - status: filter berdasarkan status detail (optional)
   * - klasifikasi: filter berdasarkan klasifikasi (optional)
   * - search: search by nomor atau perihal (optional)
   */
  @Get('naskah-masuk/detail')
  async getDetailNaskahMasuk(
    @Query() query: DetailNaskahMasukQueryDto,
  ): Promise<DetailNaskahMasukResponseDto> {
    try {
      return await this.rekapNaskahService.getDetailNaskahMasuk(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get detail naskah masuk',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
