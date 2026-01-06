import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import {
  RekapNaskahQueryDto,
  RekapNaskahResponseDto,
  RekapJenisData,
} from '../dto/rekap-naskah.dto';
import {
  DetailNaskahQueryDto,
  DetailNaskahResponseDto,
  DetailNaskahData,
} from '../dto/detail-naskah.dto';
import { StorageService } from '../../storage/services/storage.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

@Injectable()
export class RekapNaskahService {
  constructor(
    @InjectRepository(NomorRequestEntity)
    private readonly nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private readonly nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    private readonly storageService: StorageService,
    private readonly orgDataService: OrgDataService,
  ) {}

  /**
   * Get rekap naskah dinas berdasarkan filter
   * Count dari nomor_request_detail dengan status 'terpakai' (disetujui)
   */
  async getRekapNaskah(
    query: RekapNaskahQueryDto,
  ): Promise<RekapNaskahResponseDto> {
    const tahun = query.tahun ? parseInt(query.tahun, 10) : null;
    const area = query.area;
    const status = query.status;
    const position = query.position;

    // Build query untuk mengambil semua request
    const queryBuilder = this.nomorRequestRepository
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.details', 'detail')
      .where('1=1');

    // Filter berdasarkan tahun jika ada
    if (tahun) {
      queryBuilder.andWhere('YEAR(req.tanggal) = :tahun', { tahun });
    }

    // Filter berdasarkan area jika ada
    if (area) {
      queryBuilder.andWhere('req.area = :area', { area });
    }

    // Filter berdasarkan position jika ada
    if (position) {
      queryBuilder.andWhere('req.position = :position', { position });
    }

    // Filter berdasarkan status detail jika ada
    if (status) {
      queryBuilder.andWhere('detail.status = :status', { status });
    } else {
      // Default: hanya hitung yang sudah disetujui (terpakai)
      queryBuilder.andWhere('detail.status = :status', { status: 'terpakai' });
    }

    const requests = await queryBuilder.getMany();

    // Get all jenis untuk mendapatkan jenis_text
    const allJenis = await this.jenisRepository.find();
    const jenisMap = new Map<string, string | null>();
    allJenis.forEach((j) => {
      if (j.jenis) {
        jenisMap.set(j.jenis, j.jenisText);
      }
    });

    // Group by jenis dan hitung per bulan
    const rekapMap = new Map<string, RekapJenisData>();

    for (const request of requests) {
      const jenis = request.jenis || 'Unknown';
      
      if (!rekapMap.has(jenis)) {
        rekapMap.set(jenis, {
          jenis,
          jenis_text: jenisMap.get(jenis) || null,
          jan: 0,
          feb: 0,
          mar: 0,
          apr: 0,
          mei: 0,
          jun: 0,
          jul: 0,
          agu: 0,
          sep: 0,
          okt: 0,
          nov: 0,
          des: 0,
          total: 0,
        });
      }

      const rekapData = rekapMap.get(jenis)!;
      const bulan = new Date(request.tanggal!).getMonth() + 1; // 1-12

      // Hitung jumlah detail dengan status yang sesuai (sudah difilter di query)
      // Karena leftJoinAndSelect, details pasti ada (bisa array kosong)
      const jumlahDetail = request.details?.length || 0;

      // Tambahkan ke bulan yang sesuai
      switch (bulan) {
        case 1:
          rekapData.jan += jumlahDetail;
          break;
        case 2:
          rekapData.feb += jumlahDetail;
          break;
        case 3:
          rekapData.mar += jumlahDetail;
          break;
        case 4:
          rekapData.apr += jumlahDetail;
          break;
        case 5:
          rekapData.mei += jumlahDetail;
          break;
        case 6:
          rekapData.jun += jumlahDetail;
          break;
        case 7:
          rekapData.jul += jumlahDetail;
          break;
        case 8:
          rekapData.agu += jumlahDetail;
          break;
        case 9:
          rekapData.sep += jumlahDetail;
          break;
        case 10:
          rekapData.okt += jumlahDetail;
          break;
        case 11:
          rekapData.nov += jumlahDetail;
          break;
        case 12:
          rekapData.des += jumlahDetail;
          break;
      }

      rekapData.total += jumlahDetail;
    }

    // Convert map to array dan sort by jenis
    const rekap = Array.from(rekapMap.values()).sort((a, b) =>
      a.jenis.localeCompare(b.jenis),
    );

    return {
      success: true,
      message: 'Rekap naskah dinas berhasil diambil',
      data: {
        tahun: tahun || null,
        area,
        status: status || 'terpakai',
        position,
        rekap,
      },
    };
  }

  /**
   * Get detail naskah dinas yang sudah valid (terpakai)
   * Menampilkan list nomor yang sudah disetujui dengan info lengkap
   */
  async getDetailNaskah(
    query: DetailNaskahQueryDto,
  ): Promise<DetailNaskahResponseDto> {
    const tahun = query.tahun ? parseInt(query.tahun, 10) : null;
    const area = query.area;
    const jenis = query.jenis;
    const status = query.status || 'terpakai';
    const position = query.position;
    const search = query.search;

    // Build query untuk request dulu (karena filter berdasarkan area, jenis, dll)
    let requestQueryBuilder = this.nomorRequestRepository
      .createQueryBuilder('req')
      .where('1=1');

    // Filter berdasarkan tahun jika ada
    if (tahun) {
      requestQueryBuilder = requestQueryBuilder.andWhere('YEAR(req.tanggal) = :tahun', { tahun });
    }

    // Filter berdasarkan area jika ada
    if (area) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.area = :area', { area });
    }

    // Filter berdasarkan jenis jika ada
    if (jenis) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.jenis = :jenis', { jenis });
    }

    // Filter berdasarkan position jika ada
    if (position) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.position = :position', { position });
    }

    // Search by perihal
    if (search) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.perihal LIKE :search', { search: `%${search}%` });
    }

    const requests = await requestQueryBuilder.getMany();
    const requestIds = requests.map(r => r.id);

    // Jika tidak ada request yang match, return empty
    if (requestIds.length === 0) {
      return {
        success: true,
        message: 'Detail naskah dinas berhasil diambil',
        data: [],
      };
    }

    // Query detail berdasarkan request ids yang sudah difilter
    let detailQueryBuilder = this.nomorRequestDetailRepository
      .createQueryBuilder('detail')
      .where('detail.id_request IN (:...requestIds)', { requestIds })
      .andWhere('detail.status = :status', { status });

    // Search by nomor jika ada
    if (search) {
      detailQueryBuilder = detailQueryBuilder.andWhere('detail.nomor LIKE :search', { search: `%${search}%` });
    }

    // Get semua data tanpa pagination
    const details = await detailQueryBuilder
      .orderBy('detail.created_at', 'DESC')
      .getMany();

    // Get all jenis untuk mapping jenis_text
    const allJenis = await this.jenisRepository.find();
    const jenisMap = new Map<string, string | null>();
    allJenis.forEach((j) => {
      if (j.jenis) {
        jenisMap.set(j.jenis, j.jenisText);
      }
    });

    // Get org_data untuk extract jabatan
    let positionJsonData: any[] = [];
    try {
      const allOrgData = await this.orgDataService.findAll();
      if (allOrgData.length > 0) {
        const latestOrgData = allOrgData.sort((a, b) => {
          const dateA = a.tgl ? new Date(a.tgl).getTime() : 0;
          const dateB = b.tgl ? new Date(b.tgl).getTime() : 0;
          return dateB - dateA;
        })[0];
        
        if (latestOrgData?.position_json && Array.isArray(latestOrgData.position_json)) {
          positionJsonData = latestOrgData.position_json;
        }
      }
    } catch (error) {
      console.log('Could not fetch position data from org_data');
    }

    // Map request by id untuk lookup cepat
    const requestMap = new Map<string, NomorRequestEntity>();
    requests.forEach(req => requestMap.set(req.id, req));

    // Map data dengan request info
    const data: DetailNaskahData[] = await Promise.all(
      details.map(async (detail) => {
        // Lookup request dari map
        const request = detail.idRequest ? requestMap.get(detail.idRequest) || null : null;

        // Get jabatan dan lokasi dari penandatangan
        let jabatan: string | null = null;
        let lokasi: string | null = null;

        if (request?.idPositionPenandatangan) {
          const searchId = Number(request.idPositionPenandatangan);
          const positionData = positionJsonData.find(
            (p: any) => Number(p.position) === searchId,
          );
          
          if (positionData) {
            jabatan = positionData.position_text || null;
            lokasi = positionData.area_text || null;
          }
        }

        // Fallback lokasi dari request area (jika tidak ada area_text)
        if (!lokasi && request?.area) {
          lokasi = this.extractAreaCode(request.area);
        }

        // Generate file URL jika ada
        let fileUrl: string | null = null;
        if (detail.fileText) {
          try {
            fileUrl = await this.storageService.getFileUrl(detail.fileText);
          } catch (error) {
            console.log(`Failed to generate file URL for ${detail.fileText}`);
          }
        }

        return {
          id: detail.id,
          nomor: detail.nomor,
          tanggal: request?.tanggal || new Date(),
          perihal: request?.perihal || null,
          jenis: request?.jenis || null,
          jenis_text: request?.jenis ? jenisMap.get(request.jenis) || null : null,
          klasifikasi: request?.klasifikasi || null,
          jabatan,
          lokasi,
          status: detail.status,
          file_name: detail.fileName,
          file_url: fileUrl,
          created_at: detail.createdAt,
        };
      }),
    );

    return {
      success: true,
      message: 'Detail naskah dinas berhasil diambil',
      data,
    };
  }

  /**
   * Helper: Extract last 2 characters dari area code
   */
  private extractAreaCode(area: string | null | undefined): string {
    if (!area) return '';
    
    if (area.length >= 2) {
      return area.slice(-2);
    }
    
    return area.padStart(2, '0');
  }
}
