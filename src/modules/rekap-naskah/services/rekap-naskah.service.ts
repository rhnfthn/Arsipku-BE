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
import {
  NaskahMasukQueryDto,
  NaskahMasukResponseDto,
  NaskahMasukJenisData,
} from '../dto/naskah-masuk.dto';
import {
  DetailNaskahMasukQueryDto,
  DetailNaskahMasukResponseDto,
  DetailNaskahMasukData,
} from '../dto/detail-naskah-masuk.dto';
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
   * Count dari nomor_request_detail per jenis per status per bulan
   */
  async getRekapNaskah(
    query: RekapNaskahQueryDto,
  ): Promise<RekapNaskahResponseDto> {
    const tahun = query.tahun ? parseInt(query.tahun, 10) : new Date().getFullYear();
    const area = query.area;
    const position = query.position;

    // Build query untuk mengambil semua request
    const queryBuilder = this.nomorRequestRepository
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.details', 'detail')
      .where('1=1');

    // Filter berdasarkan tahun (default: tahun sekarang)
    queryBuilder.andWhere('YEAR(req.tanggal) = :tahun', { tahun });

    // Filter berdasarkan area jika ada
    if (area) {
      queryBuilder.andWhere('req.area = :area', { area });
    }

    // Filter berdasarkan position jika ada
    if (position) {
      queryBuilder.andWhere('req.position = :position', { position });
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

    // Define valid status yang ditampilkan
    const validStatuses = ['booking', 'terpakai', 'terpakai_final', 'hangus'];

    // Group by jenis + status dan hitung per bulan
    const rekapMap = new Map<string, RekapJenisData>();

    for (const request of requests) {
      const jenis = request.jenis || 'Unknown';
      
      // Process setiap detail dengan status-nya
      for (const detail of request.details || []) {
        const status = detail.status;
        
        // Skip jika status tidak termasuk dalam validStatuses
        if (!status || !validStatuses.includes(status)) {
          continue;
        }
        
        const mapKey = `${jenis}|${status}`;
        
        if (!rekapMap.has(mapKey)) {
          rekapMap.set(mapKey, {
            jenis,
            jenis_text: jenisMap.get(jenis) || null,
            status,
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

        const rekapData = rekapMap.get(mapKey)!;
        const bulan = new Date(request.tanggal!).getMonth() + 1; // 1-12

        // Tambahkan 1 untuk detail ini
        switch (bulan) {
          case 1:
            rekapData.jan += 1;
            break;
          case 2:
            rekapData.feb += 1;
            break;
          case 3:
            rekapData.mar += 1;
            break;
          case 4:
            rekapData.apr += 1;
            break;
          case 5:
            rekapData.mei += 1;
            break;
          case 6:
            rekapData.jun += 1;
            break;
          case 7:
            rekapData.jul += 1;
            break;
          case 8:
            rekapData.agu += 1;
            break;
          case 9:
            rekapData.sep += 1;
            break;
          case 10:
            rekapData.okt += 1;
            break;
          case 11:
            rekapData.nov += 1;
            break;
          case 12:
            rekapData.des += 1;
            break;
        }

        rekapData.total += 1;
      }
    }

    // Convert map to array dan sort by jenis, kemudian status (sesuai urutan: booking, terpakai, terpakai_final, hangus)
    const statusOrder = { booking: 1, terpakai: 2, terpakai_final: 3, hangus: 4 };
    const rekap = Array.from(rekapMap.values()).sort((a, b) => {
      const jenisCompare = a.jenis.localeCompare(b.jenis);
      if (jenisCompare !== 0) return jenisCompare;
      
      // Sort berdasarkan urutan status yang ditentukan
      const orderA = statusOrder[a.status] || 999;
      const orderB = statusOrder[b.status] || 999;
      return orderA - orderB;
    });

    return {
      success: true,
      message: 'Rekap naskah dinas berhasil diambil',
      data: {
        tahun,
        area,
        position,
        rekap,
      },
    };
  }

  /**
   * Get detail naskah dinas
   * Menampilkan list nomor dengan 4 status (booking, terpakai, terpakai_final, hangus)
   */
  async getDetailNaskah(
    query: DetailNaskahQueryDto,
  ): Promise<DetailNaskahResponseDto> {
    const tahun = query.tahun ? parseInt(query.tahun, 10) : new Date().getFullYear();
    const area = query.area;
    const jenis = query.jenis;
    const position = query.position;
    const search = query.search;

    // Define valid status yang ditampilkan
    const validStatuses = ['booking', 'terpakai', 'terpakai_final', 'hangus'];
    
    // Jika status diberikan, gunakan satu status; jika tidak, gunakan semua valid statuses
    const statusesToShow = query.status ? [query.status] : validStatuses;

    // Build query untuk request dulu (karena filter berdasarkan area, jenis, dll)
    let requestQueryBuilder = this.nomorRequestRepository
      .createQueryBuilder('req')
      .where('1=1');

    // Filter berdasarkan tahun (default: tahun sekarang)
    requestQueryBuilder = requestQueryBuilder.andWhere('YEAR(req.tanggal) = :tahun', { tahun });

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

    // Jika tidak ada request yang match, return empty dengan pagination
    if (requestIds.length === 0) {
      return {
        success: true,
        message: 'Detail naskah dinas berhasil diambil',
        data: [],
        pagination: {
          page: query.page || 1,
          limit: query.limit || 10,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Query detail berdasarkan request ids yang sudah difilter dan status
    let detailQueryBuilder = this.nomorRequestDetailRepository
      .createQueryBuilder('detail')
      .where('detail.id_request IN (:...requestIds)', { requestIds })
      .andWhere('detail.status IN (:...statuses)', { statuses: statusesToShow });

    // Search by nomor jika ada
    if (search) {
      detailQueryBuilder = detailQueryBuilder.andWhere('detail.nomor LIKE :search', { search: `%${search}%` });
    }

    // Get semua data tanpa pagination dulu untuk count
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

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = details.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedDetails = details.slice(skip, skip + limit);

    // Map data dengan request info
    const data: DetailNaskahData[] = await Promise.all(
      paginatedDetails.map(async (detail) => {
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
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
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

  /**
   * Get naskah masuk (rekap per jenis per bulan)
   * Menampilkan semua jenis naskah dari nomor_request_detail
   */
  async getNaskahMasuk(
    query: NaskahMasukQueryDto,
  ): Promise<NaskahMasukResponseDto> {
    const tahun = query.tahun ? parseInt(query.tahun, 10) : new Date().getFullYear();
    const bulan = query.bulan ? parseInt(query.bulan, 10) : null;
    const area = query.area;
    const jenis = query.jenis;
    const klasifikasi = query.klasifikasi;

    // Build query untuk mengambil semua request
    const queryBuilder = this.nomorRequestRepository
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.details', 'detail')
      .where('1=1');

    // Filter berdasarkan tahun (default: tahun sekarang)
    queryBuilder.andWhere('YEAR(req.tanggal) = :tahun', { tahun });

    // Filter berdasarkan bulan jika ada (1-12)
    if (bulan && bulan >= 1 && bulan <= 12) {
      queryBuilder.andWhere('MONTH(req.tanggal) = :bulan', { bulan });
    }

    // Filter berdasarkan area jika ada
    if (area) {
      queryBuilder.andWhere('req.area = :area', { area });
    }

    // Filter berdasarkan jenis jika ada
    if (jenis) {
      queryBuilder.andWhere('req.jenis = :jenis', { jenis });
    }

    // Filter berdasarkan klasifikasi jika ada
    if (klasifikasi) {
      queryBuilder.andWhere('req.klasifikasi = :klasifikasi', { klasifikasi });
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

    // Group by jenis dan hitung per bulan (untuk semua detail, tidak filter status)
    const rekapMap = new Map<string, NaskahMasukJenisData>();

    for (const request of requests) {
      const jenisCode = request.jenis || 'Unknown';
      
      // Process setiap detail
      for (const detail of request.details || []) {
        if (!rekapMap.has(jenisCode)) {
          rekapMap.set(jenisCode, {
            jenis: jenisCode,
            jenis_text: jenisMap.get(jenisCode) || null,
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

        const rekapData = rekapMap.get(jenisCode)!;
        const bulan = new Date(request.tanggal!).getMonth() + 1; // 1-12

        // Tambahkan 1 untuk detail ini
        switch (bulan) {
          case 1:
            rekapData.jan += 1;
            break;
          case 2:
            rekapData.feb += 1;
            break;
          case 3:
            rekapData.mar += 1;
            break;
          case 4:
            rekapData.apr += 1;
            break;
          case 5:
            rekapData.mei += 1;
            break;
          case 6:
            rekapData.jun += 1;
            break;
          case 7:
            rekapData.jul += 1;
            break;
          case 8:
            rekapData.agu += 1;
            break;
          case 9:
            rekapData.sep += 1;
            break;
          case 10:
            rekapData.okt += 1;
            break;
          case 11:
            rekapData.nov += 1;
            break;
          case 12:
            rekapData.des += 1;
            break;
        }

        rekapData.total += 1;
      }
    }

    // Convert map to array dan sort by jenis
    const rekap = Array.from(rekapMap.values()).sort((a, b) =>
      a.jenis.localeCompare(b.jenis),
    );

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = rekap.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedRekap = rekap.slice(skip, skip + limit);

    return {
      success: true,
      message: 'Naskah masuk berhasil diambil',
      data: {
        tahun,
        bulan,
        area,
        jenis,
        klasifikasi,
        rekap: paginatedRekap,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get detail list naskah masuk
   * Menampilkan list detail nomor dengan filter
   */
  async getDetailNaskahMasuk(
    query: DetailNaskahMasukQueryDto,
  ): Promise<DetailNaskahMasukResponseDto> {
    const tahun = query.tahun ? parseInt(query.tahun, 10) : new Date().getFullYear();
    const bulan = query.bulan ? parseInt(query.bulan, 10) : null;
    const area = query.area;
    const jenis = query.jenis;
    const status = query.status;
    const klasifikasi = query.klasifikasi;
    const search = query.search;

    // Build query untuk request dulu
    let requestQueryBuilder = this.nomorRequestRepository
      .createQueryBuilder('req')
      .where('1=1');

    // Filter berdasarkan tahun (default: tahun sekarang)
    requestQueryBuilder = requestQueryBuilder.andWhere('YEAR(req.tanggal) = :tahun', { tahun });

    // Filter berdasarkan bulan jika ada
    if (bulan && bulan >= 1 && bulan <= 12) {
      requestQueryBuilder = requestQueryBuilder.andWhere('MONTH(req.tanggal) = :bulan', { bulan });
    }

    // Filter berdasarkan area jika ada
    if (area) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.area = :area', { area });
    }

    // Filter berdasarkan jenis jika ada
    if (jenis) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.jenis = :jenis', { jenis });
    }

    // Filter berdasarkan klasifikasi jika ada
    if (klasifikasi) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.klasifikasi = :klasifikasi', { klasifikasi });
    }

    // Search by perihal
    if (search) {
      requestQueryBuilder = requestQueryBuilder.andWhere('req.perihal LIKE :search', { search: `%${search}%` });
    }

    const requests = await requestQueryBuilder.getMany();
    const requestIds = requests.map(r => r.id);

    // Jika tidak ada request yang match, return empty dengan pagination
    if (requestIds.length === 0) {
      return {
        success: true,
        message: 'Detail naskah masuk berhasil diambil',
        data: [],
        pagination: {
          page: query.page || 1,
          limit: query.limit || 10,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Query detail berdasarkan request ids yang sudah difilter
    let detailQueryBuilder = this.nomorRequestDetailRepository
      .createQueryBuilder('detail')
      .where('detail.id_request IN (:...requestIds)', { requestIds });

    // Filter berdasarkan status jika ada
    if (status) {
      detailQueryBuilder = detailQueryBuilder.andWhere('detail.status = :status', { status });
    }

    // Search by nomor jika ada
    if (search) {
      detailQueryBuilder = detailQueryBuilder.andWhere('detail.nomor LIKE :search', { search: `%${search}%` });
    }

    // Get semua data tanpa pagination dulu untuk count
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

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = details.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedDetails = details.slice(skip, skip + limit);

    // Map data dengan request info
    const data: DetailNaskahMasukData[] = await Promise.all(
      paginatedDetails.map(async (detail) => {
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

        return {
          id: detail.id,
          naskah: request?.jenis || null,
          naskah_text: request?.jenis ? jenisMap.get(request.jenis) || null : null,
          nomor: detail.nomor,
          tanggal: request?.tanggal || new Date(),
          perihal: request?.perihal || null,
          jabatan,
          lokasi,
          status: detail.status,
        };
      }),
    );

    return {
      success: true,
      message: 'Detail naskah masuk berhasil diambil',
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}
