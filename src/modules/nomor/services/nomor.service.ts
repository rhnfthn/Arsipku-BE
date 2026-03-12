import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NomorEntity } from '../entities/nomor.entity';
import { NomorRequestEntity } from '../entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../entities/nomor-request-detail.entity';
import { JenisEntity } from '../entities/jenis.entity';
import { StorageService } from '../../storage/services/storage.service';
import {
  CreateNomorRequestDto,
  CreateNomorRequestResponseDto,
} from '../dto/create-nomor-request.dto';
import {
  GetMyNomorRequestResponseDto,
  GetAdminNomorRequestResponseDto,
} from '../dto/get-nomor-request.dto';
import {
  BookingNomorRequestDto,
  BookingNomorRequestResponseDto,
  ApproveNomorRequestDetailDto,
  ApproveNomorRequestDetailResponseDto,
  RejectNomorRequestDetailResponseDto,
  ApproveBulkNomorRequestDetailDto,
  ApproveBulkNomorRequestDetailResponseDto,
  RejectBulkNomorRequestDetailDto,
  RejectBulkNomorRequestDetailResponseDto,
  DeleteNomorRequestResponseDto,
  RejectAllNomorRequestResponseDto,
} from '../dto/admin-nomor-request.dto';
import {
  GetNomorQueryDto,
  GetNomorResponseDto,
} from '../dto/get-nomor.dto';
import {
  AdminCreateNomorDto,
  AdminCreateNomorResponseDto,
} from '../dto/admin-create-nomor.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NomorService {
  // Cache untuk position JSON data (per-request lifecycle)
  private cachedPositionJsonData: any[] | null = null;

  constructor(
    @InjectRepository(NomorEntity)
    private readonly nomorRepository: Repository<NomorEntity>,
    @InjectRepository(NomorRequestEntity)
    private readonly nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private readonly nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Helper: Get latest position JSON data dengan caching
   * Cache di-reset setiap kali method ini dipanggil dengan forceRefresh=true
   */
  private async getLatestPositionJsonData(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && this.cachedPositionJsonData !== null) {
      return this.cachedPositionJsonData;
    }

    try {
      const allOrgData = await this.orgDataService.findAll();
      if (allOrgData.length > 0) {
        const latestOrgData = allOrgData.sort((a, b) => {
          const dateA = a.tgl ? new Date(a.tgl).getTime() : 0;
          const dateB = b.tgl ? new Date(b.tgl).getTime() : 0;
          return dateB - dateA;
        })[0];

        if (latestOrgData?.position_json && Array.isArray(latestOrgData.position_json)) {
          this.cachedPositionJsonData = latestOrgData.position_json;
          return this.cachedPositionJsonData;
        }
      }
    } catch (error) {
      console.log('Could not fetch position data from org_data');
    }

    this.cachedPositionJsonData = [];
    return [];
  }

  /**
   * Helper: Determine status dari details array
   */
  private determineStatusFromDetails(details: NomorRequestDetailEntity[]): string {
    if (details.length === 0) return 'Belum Diajukan';

    const hasDraft = details.some((d) => d.status === 'draft');
    const hasBooking = details.some((d) => d.status === 'booking');
    const hasTerpakai = details.some((d) => d.status === 'terpakai' || d.status === 'terpakai_final');
    const allHangus = details.every((d) => d.status === 'hangus');
    const allDitolak = details.every((d) => d.status === 'ditolak');
    const hasRejected = details.some((d) => d.status === 'hangus' || d.status === 'ditolak');

    if (hasTerpakai) return 'Disetujui';
    if (allHangus || allDitolak || (hasRejected && !hasBooking && !hasTerpakai && !hasDraft)) return 'Ditolak';
    if (hasBooking) return 'Menunggu Verifikasi';
    if (hasDraft) return 'Menunggu Persetujuan';
    
    return 'Belum Diajukan';
  }

  /**
   * Helper: Determine status key untuk counting (lowercase dengan underscore)
   */
  private determineStatusKeyFromDetails(details: NomorRequestDetailEntity[]): string {
    if (details.length === 0) return 'belum_diajukan';

    const hasDraft = details.some((d) => d.status === 'draft');
    const hasBooking = details.some((d) => d.status === 'booking');
    const hasTerpakai = details.some((d) => d.status === 'terpakai' || d.status === 'terpakai_final');
    const allHangus = details.every((d) => d.status === 'hangus');
    const allDitolak = details.every((d) => d.status === 'ditolak');
    const hasRejected = details.some((d) => d.status === 'hangus' || d.status === 'ditolak');

    if (hasTerpakai) return 'disetujui';
    if (allHangus || allDitolak || (hasRejected && !hasBooking && !hasTerpakai && !hasDraft)) return 'ditolak';
    if (hasBooking) return 'menunggu_verifikasi';
    if (hasDraft) return 'menunggu_persetujuan';
    
    return 'belum_diajukan';
  }

  /**
   * Helper: Check apakah request berasal dari tulis surat otomatis
   */
  private isFromTulisSuratOtomatis(details: NomorRequestDetailEntity[]): boolean {
    if (details.length === 0) return false;
    return details.every((d) => d.status === 'terpakai' || d.status === 'terpakai_final');
  }

  /**
   * Helper: Map position text to jabatan code
   * P = Dir. SDM, U = Dirut, S = Dir. Keselamatan, O = Dir. Operasi, K = Dir. Keuangan
   */
  private mapPositionToJabatanCode(positionText: string | null | undefined): string {
    if (!positionText) return '';
    
    const positionLower = positionText.toLowerCase().trim();
    
    // Hardcoded mapping sesuai contoh - cek berdasarkan text dengan berbagai variasi
    if (
      positionLower.includes('direktur sdm dan umum')
    ) {
      return 'P';
    }
    
    if (
      positionLower.includes('direktur utama')
    ) {
      return 'U';
    }
    
    if (
      positionLower.includes('direktur keselamatan, keamanan dan standardisasi')
    ) {
      return 'S';
    }
    
    if (
      positionLower.includes('direktur operasi')
    ) {
      return 'O';
    }

    if (
      positionLower.includes('direktur teknik')
    ) {
      return 'T';
    }
    
    if (
      positionLower.includes('direktur keuangan dan manajemen risiko')
    ) {
      return 'K';
    }
    
    return '';
  }

  /**
   * Helper: Extract last 2 characters dari area code
   * Contoh: "00" untuk Pusat, "01" untuk Cabang
   */
  private extractAreaCode(area: string | null | undefined): string {
    if (!area) return '';
    
    // Ambil 2 karakter terakhir
    if (area.length >= 2) {
      return area.slice(-2);
    }
    
    return area.padStart(2, '0');
  }

  /**
   * Helper: Generate nomor berdasarkan format dari tabel jenis
   * Placeholder yang didukung:
   * - {TIPE} = jenis nomor (PER, KEP, INS, dll)
   * - {NO_URUT} = nomor urut dengan padding 3 digit
   * - {INSTANSI} = company code
   * - {JABATAN} = position abbreviation dari org_data
   * - {LOKASI} = area code
   * - {KLASIFIKASI} = klasifikasi code
   * - {BULAN} = bulan dalam romawi
   * - {TAHUN} = tahun 4 digit
   */
  private async generateNomorFromFormat(
    format: string,
    noUrut: number,
    request: NomorRequestEntity,
    tahun: number,
    penandatanganPositionAbbreviation?: string | null,
    penandatanganArea?: string | null,
  ): Promise<string> {
    const bulan = new Date(request.tanggal!).getMonth() + 1;
    const bulanRomawi = this.getBulanRomawi(bulan);
    const noUrutFormatted = noUrut.toString().padStart(3, '0');

    // Jabatan, Lokasi, Instansi diambil dari penandatangan
    const jabatanCode = penandatanganPositionAbbreviation || '';
    const lokasiCode = this.extractAreaCode(penandatanganArea);
    const instansi = 'LPPNPI'; // Hardcoded

    // Replace placeholders dengan nilai sebenarnya
    let nomorBaru = format
      .replace(/{TIPE}/g, request.jenis || '')
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, request.klasifikasi || '')
      .replace(/{BULAN}/g, bulanRomawi)
      .replace(/{TAHUN}/g, tahun.toString());

    return nomorBaru;
  }

  private looksLikeStorageKey(key: string | null | undefined): boolean {
    if (!key) return false;
    // Expected pattern from StorageService.uploadFile(): {folder}/{timestamp}-{sanitizedFileName}
    if (!key.includes('/')) return false;
    const base = key.split('/').pop() || '';
    return /^\d{10,}-/.test(base);
  }

  private async getDetailFileUrlAndHeal(
    detail: NomorRequestDetailEntity,
    folder: string = 'nomor',
  ): Promise<string | null> {
    const key = detail.fileText;
    if (key && this.looksLikeStorageKey(key)) {
      // Fast-path: treat as valid key
      return await this.storageService.getFileUrl(key);
    }

    // Jika fileText kosong atau kelihatan bukan key (misalnya nama file original), coba self-heal
    const originalName = detail.fileName || detail.fileText;
    if (!originalName) return null;

    const foundKey = await this.storageService.findLatestKeyByOriginalName(
      originalName,
      folder,
    );

    if (!foundKey) {
      return null;
    }

    // Update DB agar request berikutnya sudah benar
    detail.fileText = foundKey;
    if (!detail.fileName) {
      detail.fileName = originalName;
    }
    await this.nomorRequestDetailRepository.save(detail);

    return await this.storageService.getFileUrl(foundKey);
  }

  /**
   * User membuat usulan nomor baru
   * Data company, area, sub_area, organization diambil dari org_data berdasarkan position_id
   */
  async createNomorRequest(
    dto: CreateNomorRequestDto,
  ): Promise<CreateNomorRequestResponseDto> {
    // Ambil data org_data berdasarkan tanggal
    const tglFormatted = this.formatDate(dto.tanggal);
    const orgDataRecord = await this.orgDataService.findOrg(tglFormatted);
    
    // Parse position_json dan cari position_id
    const positionJson = orgDataRecord.position_json;
    const positionData = Array.isArray(positionJson) 
      ? positionJson.find((p: any) => p.position === dto.position_id)
      : null;

    if (!positionData) {
      throw new NotFoundException(
        `Position dengan ID ${dto.position_id} tidak ditemukan di org_data untuk tanggal ${tglFormatted}`
      );
    }

    const requestId = uuidv4();

    const nomorRequest = this.nomorRequestRepository.create({
      id: requestId,
      company: positionData.company?.toString() || null,
      area: positionData.area || null,
      subArea: positionData.sub_area?.toString() || null,
      organization: positionData.organization_id?.toString() || null,
      position: dto.position_id.toString(),
      tanggal: dto.tanggal,
      jenis: dto.jenis,
      klasifikasi: dto.klasifikasi || null,
      perihal: dto.perihal,
      jumlah: dto.jumlah,
      penandatangan: dto.penandatangan || null,
      idPositionPenandatangan: dto.id_position_penandatangan || null,
    });

    await this.nomorRequestRepository.save(nomorRequest);

    return {
      success: true,
      message: 'Usulan nomor berhasil dibuat',
      data: {
        id: nomorRequest.id,
        company: nomorRequest.company!,
        area: nomorRequest.area!,
        sub_area: nomorRequest.subArea!,
        organization: nomorRequest.organization!,
        position: nomorRequest.position!,
        tanggal: nomorRequest.tanggal!,
        jenis: nomorRequest.jenis!,
        klasifikasi: nomorRequest.klasifikasi,
        perihal: nomorRequest.perihal!,
        jumlah: nomorRequest.jumlah!,
        penandatangan: nomorRequest.penandatangan,
        created_at: nomorRequest.createdAt,
      },
    };
  }

  /**
   * Helper: Format Date ke YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * User melihat usulan nomor berdasarkan position_id
   * OPTIMIZED: Menggunakan LEFT JOIN untuk load details bersamaan
   */
  async getNomorRequestByPosition(
    positionId: number,
    query?: GetNomorQueryDto,
  ): Promise<GetMyNomorRequestResponseDto> {
    // Optimized: Load requests dengan details dalam 1 query
    const requests = await this.nomorRequestRepository.find({
      where: { position: positionId.toString() },
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Pre-cache jenis data untuk generateNomorTemplate
    const jenisCache = new Map<string, any>();
    const uniqueJenis = [...new Set(requests.map(r => r.jenis).filter((j): j is string => j !== null && j !== undefined))];
    if (uniqueJenis.length > 0) {
      const jenisDataList = await this.jenisRepository.find({
        where: uniqueJenis.map(j => ({ jenis: j })),
      });
      jenisDataList.forEach(j => jenisCache.set(j.jenis!, j));
    }

    // Generate data tanpa N+1 query
    const data = await Promise.all(
      requests.map(async (request) => {
        const details = request.details || [];
        // Sort details by createdAt ASC
        details.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Generate template nomor (menggunakan cache)
        const templateNomor = await this.generateNomorTemplate(request);

        return {
          id: request.id,
          company: request.company!,
          area: request.area!,
          sub_area: request.subArea!,
          organization: request.organization!,
          position: request.position!,
          tanggal: request.tanggal!,
          jenis: request.jenis!,
          klasifikasi: request.klasifikasi,
          perihal: request.perihal!,
          jumlah: request.jumlah!,
          penandatangan: request.penandatangan,
          is_single_file: request.isSingleFile,
          template_nomor: templateNomor,
          created_at: request.createdAt,
          details: request.isSingleFile === 1 && details.length > 0
            ? [{
                id: details[0].id,
                nomor: details[0].nomor,
                status: details[0].status,
                file_name: details[0].fileName,
                file_url: await this.getDetailFileUrlAndHeal(details[0], 'nomor'),
                created_at: details[0].createdAt,
              }]
            : await Promise.all(
                details.map(async (detail) => ({
                  id: detail.id,
                  nomor: detail.nomor,
                  status: detail.status,
                  file_name: detail.fileName,
                  file_url: await this.getDetailFileUrlAndHeal(detail, 'nomor'),
                  created_at: detail.createdAt,
                })),
              ),
        };
      }),
    );

    // Apply search filter
    let filteredData = data;
    if (query?.search) {
      const searchLower = query.search.toLowerCase();
      filteredData = data.filter((item) => {
        const perihalMatch = item.perihal && item.perihal.toLowerCase().includes(searchLower);
        const jenisMatch = item.jenis && item.jenis.toLowerCase().includes(searchLower);
        const penandatanganMatch = item.penandatangan && item.penandatangan.toLowerCase().includes(searchLower);
        return perihalMatch || jenisMatch || penandatanganMatch;
      });
    }

    // Apply status filter menggunakan helper
    if (query?.status && query.status !== 'Semua') {
      filteredData = filteredData.filter((item) => {
        const details = item.details || [];
        // Convert to entity-like format for helper
        const detailsForHelper = details.map(d => ({ status: d.status }) as NomorRequestDetailEntity);
        const status = this.determineStatusFromDetails(detailsForHelper);
        return status === query.status;
      });
    }

    // Apply sorting
    if (query?.sort_by) {
      const sortOrder = query.sort_order?.toLowerCase() === 'asc' ? 1 : -1;
      filteredData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (query.sort_by === 'tanggal') {
          aValue = new Date(a.tanggal).getTime();
          bValue = new Date(b.tanggal).getTime();
        } else if (query.sort_by === 'tanggal_usulan' || query.sort_by === 'waktu') {
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
        } else {
          return 0;
        }

        return (aValue - bValue) * sortOrder;
      });
    }

    // Apply pagination
    let paginatedData = filteredData;
    const result: any = {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data: filteredData,
    };

    if (query?.page || query?.limit) {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const total = filteredData.length;
      const totalPages = Math.ceil(total / limit);
      const skip = (page - 1) * limit;
      paginatedData = filteredData.slice(skip, skip + limit);
      result.data = paginatedData;
      result.pagination = { page, limit, total, totalPages };
    }

    return result;
  }

  /**
   * Admin melihat semua usulan nomor yang sudah diajukan (status != 'Belum Diajukan')
   * Hanya menampilkan data dari usulan manual (bukan dari tulis surat otomatis)
   * OPTIMIZED: Menggunakan LEFT JOIN dan caching
   */
  async getAdminNomorRequestSubmitted(query?: GetNomorQueryDto): Promise<GetAdminNomorRequestResponseDto> {
    // Optimized: Load requests dengan details dalam 1 query
    const requests = await this.nomorRequestRepository.find({
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Process data tanpa N+1 query
    const data = requests.map((request) => {
      const details = request.details || [];

      // Skip jika dari tulis surat otomatis
      if (this.isFromTulisSuratOtomatis(details)) {
        return null;
      }

      const status = this.determineStatusFromDetails(details);

      // Get position data
      const positionNumber = parseInt(request.position!, 10);
      const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
      
      const persnum = positionData?.persnum_person || null;
      const nama = positionData?.persnum_person_text || null;

      const responseItem = {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum,
        nama,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status,
      };

      // Apply search filter across all fields
      if (query?.search) {
        const searchLower = query.search.toLowerCase();
        const searchFields = [
          responseItem.id?.toString(),
          responseItem.company,
          responseItem.area,
          responseItem.sub_area,
          responseItem.organization,
          responseItem.position,
          responseItem.persnum?.toString(),
          responseItem.nama,
          responseItem.tanggal,
          responseItem.jenis,
          responseItem.klasifikasi,
          responseItem.perihal,
          responseItem.jumlah?.toString(),
          responseItem.penandatangan,
          responseItem.status,
        ];
        
        const isMatch = searchFields.some(field => 
          field && field.toLowerCase().includes(searchLower)
        );
        
        if (!isMatch) {
          return null;
        }
      }

      // Apply status filter
      if (query?.status && query.status !== 'Semua' && status !== query.status) {
        return null;
      }

      return responseItem;
    });

    // Filter out null values and 'Belum Diajukan'
    const submittedData = data.filter((item): item is Exclude<typeof item, null> => 
      item !== null && item.status !== 'Belum Diajukan'
    );

    // Apply sorting
    if (query?.sort_by) {
      const sortOrder = query.sort_order?.toLowerCase() === 'asc' ? 1 : -1;
      submittedData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (query.sort_by === 'tanggal') {
          aValue = new Date(a.tanggal).getTime();
          bValue = new Date(b.tanggal).getTime();
        } else if (query.sort_by === 'tanggal_usulan' || query.sort_by === 'waktu') {
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
        } else if (query.sort_by === 'jenis') {
          aValue = (a.jenis || '').toLowerCase();
          bValue = (b.jenis || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else if (query.sort_by === 'status') {
          aValue = (a.status || '').toLowerCase();
          bValue = (b.status || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else {
          return 0;
        }

        return (aValue - bValue) * sortOrder;
      });
    }

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = submittedData.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedData = submittedData.slice(skip, skip + limit);

    return {
      success: true,
      message: 'Data usulan nomor yang diajukan berhasil diambil',
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Count nomor request by status (for admin dashboard)
   * - Semua data dengan status selain "Belum Diajukan" di-count
   * - Data dengan status "Belum Diajukan" hanya yang dibuat oleh posisi tertentu
   * Hanya count data dari usulan manual (bukan dari tulis surat otomatis)
   * OPTIMIZED: Menggunakan LEFT JOIN
   */
  async getAdminCountNomorRequest(positionId: number): Promise<any> {
    // Load all requests and penandatangan requests in parallel
    const [requests, penandatanganRequests] = await Promise.all([
      this.nomorRequestRepository.find({
        relations: ['details'],
      }),
      this.nomorRequestRepository.find({
        where: { idPositionPenandatangan: positionId },
        relations: ['details'],
      }),
    ]);

    // Count by status
    const statusCounts = {
      menunggu_verifikasi: 0,
      disetujui: 0,
      ditolak: 0,
      belum_diajukan: 0,
    };

    let processedCount = 0;
    for (const request of requests) {
      const details = request.details || [];

      // Skip jika dari tulis surat otomatis
      if (this.isFromTulisSuratOtomatis(details)) {
        continue;
      }

      const statusKey = this.determineStatusKeyFromDetails(details);

      // Filter: jika status "belum_diajukan", hanya count yang dibuat oleh posisi ini
      if (statusKey === 'belum_diajukan' && request.position !== positionId.toString()) {
        continue;
      }

      // Skip menunggu_persetujuan di loop utama; dihitung via penandatangan
      if (statusKey === 'menunggu_persetujuan') {
        continue;
      }

      processedCount++;

      // Increment counter
      if (statusKey in statusCounts) {
        statusCounts[statusKey as keyof typeof statusCounts]++;
      }
    }

    // Count menunggu_persetujuan untuk halaman persetujuan (sebagai penandatangan)
    let menungguPersetujuanCount = 0;
    for (const request of penandatanganRequests) {
      const details = request.details || [];

      if (this.isFromTulisSuratOtomatis(details)) {
        continue;
      }

      const statusKey = this.determineStatusKeyFromDetails(details);
      if (statusKey === 'menunggu_persetujuan') {
        menungguPersetujuanCount++;
      }
    }

    return {
      success: true,
      message: 'Count usulan nomor berhasil diambil',
      data: {
        menunggu_verifikasi: statusCounts.menunggu_verifikasi,
        disetujui: statusCounts.disetujui,
        ditolak: statusCounts.ditolak,
        belum_diajukan: statusCounts.belum_diajukan,
        menunggu_persetujuan: menungguPersetujuanCount,
        total: processedCount,
      },
    };
  }

  /**
   * Count nomor request by status filtered by position ID
   * Hanya count data dari usulan manual (bukan dari tulis surat otomatis)
   * OPTIMIZED: Menggunakan LEFT JOIN
   */
  async getAdminCountNomorRequestByPosition(positionId: number): Promise<any> {
    // Load requests by requester position and by penandatangan position in parallel
    const [requests, penandatanganRequests] = await Promise.all([
      this.nomorRequestRepository.find({
        where: { position: positionId.toString() },
        relations: ['details'],
      }),
      this.nomorRequestRepository.find({
        where: { idPositionPenandatangan: positionId },
        relations: ['details'],
      }),
    ]);

    // Count by status
    const statusCounts = {
      menunggu_verifikasi: 0,
      disetujui: 0,
      ditolak: 0,
      belum_diajukan: 0,
    };

    let processedCount = 0;
    for (const request of requests) {
      const details = request.details || [];

      // Skip jika dari tulis surat otomatis
      if (this.isFromTulisSuratOtomatis(details)) {
        continue;
      }

      const statusKey = this.determineStatusKeyFromDetails(details);

      // Skip menunggu_persetujuan di loop utama; dihitung via penandatangan
      if (statusKey === 'menunggu_persetujuan') {
        continue;
      }

      processedCount++;

      // Increment counter
      if (statusKey in statusCounts) {
        statusCounts[statusKey as keyof typeof statusCounts]++;
      }
    }

    // Count menunggu_persetujuan untuk halaman persetujuan (sebagai penandatangan)
    let menungguPersetujuanCount = 0;
    for (const request of penandatanganRequests) {
      const details = request.details || [];

      if (this.isFromTulisSuratOtomatis(details)) {
        continue;
      }

      const statusKey = this.determineStatusKeyFromDetails(details);
      if (statusKey === 'menunggu_persetujuan') {
        menungguPersetujuanCount++;
      }
    }

    return {
      success: true,
      message: 'Count usulan nomor untuk position berhasil diambil',
      data: {
        position_id: positionId,
        menunggu_verifikasi: statusCounts.menunggu_verifikasi,
        disetujui: statusCounts.disetujui,
        ditolak: statusCounts.ditolak,
        belum_diajukan: statusCounts.belum_diajukan,
        menunggu_persetujuan: menungguPersetujuanCount,
        total: processedCount,
      },
    };
  }

  /**
   * Admin melihat semua usulan nomor
   * Hanya menampilkan data dari usulan manual (bukan dari tulis surat otomatis)
   * Filter: Request yang pernah memiliki detail dengan status 'booking'
   * OPTIMIZED: Menggunakan LEFT JOIN dan caching
   */
  async getAdminNomorRequest(query?: GetNomorQueryDto): Promise<GetAdminNomorRequestResponseDto> {
    // Optimized: Load dengan relations dalam 1 query
    const requests = await this.nomorRequestRepository.find({
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Process tanpa N+1 query
    const data = requests.map((request) => {
      const details = request.details || [];

      // Skip jika dari tulis surat otomatis
      if (this.isFromTulisSuratOtomatis(details)) {
        return null;
      }

      const status = this.determineStatusFromDetails(details);

      // Get position data
      const positionNumber = parseInt(request.position!, 10);
      const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
      
      const persnum = positionData?.persnum_person || null;
      const nama = positionData?.persnum_person_text || null;

      // Apply search filter
      if (query?.search) {
        const searchLower = query.search.toLowerCase();
        const perihalMatch = request.perihal && request.perihal.toLowerCase().includes(searchLower);
        const jenisMatch = request.jenis && request.jenis.toLowerCase().includes(searchLower);
        const nomorMatch = request.penandatangan && request.penandatangan.toLowerCase().includes(searchLower);
        
        if (!perihalMatch && !jenisMatch && !nomorMatch) {
          return null;
        }
      }

      // Apply status filter
      if (query?.status && query.status !== 'Semua' && status !== query.status) {
        return null;
      }

      return {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum,
        nama,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status,
      };
    });

    // Filter out null values
    const filteredData = data.filter((item): item is Exclude<typeof item, null> => item !== null);

    // Apply sorting
    if (query?.sort_by) {
      const sortOrder = query.sort_order?.toLowerCase() === 'asc' ? 1 : -1;
      filteredData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (query.sort_by === 'tanggal') {
          aValue = new Date(a.tanggal).getTime();
          bValue = new Date(b.tanggal).getTime();
        } else if (query.sort_by === 'tanggal_usulan' || query.sort_by === 'waktu') {
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
        } else if (query.sort_by === 'jenis') {
          aValue = (a.jenis || '').toLowerCase();
          bValue = (b.jenis || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else if (query.sort_by === 'status') {
          aValue = (a.status || '').toLowerCase();
          bValue = (b.status || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else {
          return 0;
        }

        return (aValue - bValue) * sortOrder;
      });
    }

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = filteredData.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Admin melihat semua usulan nomor dengan filter posisi
   * - Semua data dengan status selain "Belum Diajukan" ditampilkan
   * - Data dengan status "Belum Diajukan" hanya yang dibuat oleh posisi tertentu
   * - Hanya menampilkan data dari usulan manual (bukan dari tulis surat otomatis)
   * OPTIMIZED: Menggunakan LEFT JOIN dan caching
   */
  async getAdminNomorRequestByPosition(positionId: number, query?: GetNomorQueryDto): Promise<GetAdminNomorRequestResponseDto> {
    // Optimized: Load dengan relations dalam 1 query
    const requests = await this.nomorRequestRepository.find({
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Process tanpa N+1 query
    const data = requests.map((request) => {
      const details = request.details || [];

      // Skip jika dari tulis surat otomatis
      if (this.isFromTulisSuratOtomatis(details)) {
        return null;
      }

      const status = this.determineStatusFromDetails(details);

      // Filter: jika status "Belum Diajukan", hanya tampilkan yang dibuat oleh posisi ini
      if (status === 'Belum Diajukan' && request.position !== positionId.toString()) {
        return null;
      }

      // Get position data
      const positionNumber = parseInt(request.position!, 10);
      const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
      
      const persnum = positionData?.persnum_person || null;
      const nama = positionData?.persnum_person_text || null;

      const responseItem = {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum,
        nama,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status,
      };

      // Apply search filter across all fields
      if (query?.search) {
        const searchLower = query.search.toLowerCase();
        const searchFields = [
          responseItem.id?.toString(),
          responseItem.company,
          responseItem.area,
          responseItem.sub_area,
          responseItem.organization,
          responseItem.position,
          responseItem.persnum?.toString(),
          responseItem.nama,
          responseItem.tanggal,
          responseItem.jenis,
          responseItem.klasifikasi,
          responseItem.perihal,
          responseItem.jumlah?.toString(),
          responseItem.penandatangan,
          responseItem.status,
        ];
        
        const isMatch = searchFields.some(field => 
          field && field.toLowerCase().includes(searchLower)
        );
        
        if (!isMatch) {
          return null;
        }
      }

      // Apply status filter
      if (query?.status && query.status !== 'Semua' && status !== query.status) {
        return null;
      }

      return responseItem;
    });

    // Filter out null values
    const filteredData = data.filter((item): item is Exclude<typeof item, null> => item !== null);

    // Apply sorting
    if (query?.sort_by) {
      const sortOrder = query.sort_order?.toLowerCase() === 'asc' ? 1 : -1;
      filteredData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (query.sort_by === 'tanggal') {
          aValue = new Date(a.tanggal).getTime();
          bValue = new Date(b.tanggal).getTime();
        } else if (query.sort_by === 'tanggal_usulan' || query.sort_by === 'waktu') {
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
        } else if (query.sort_by === 'jenis') {
          aValue = (a.jenis || '').toLowerCase();
          bValue = (b.jenis || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else if (query.sort_by === 'status') {
          aValue = (a.status || '').toLowerCase();
          bValue = (b.status || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else {
          return 0;
        }

        return (aValue - bValue) * sortOrder;
      });
    }

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = filteredData.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get detail usulan nomor berdasarkan ID (usulan saja, tanpa details)
   */
  async getNomorRequestDetail(
    requestId: string,
  ): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    // Get org_data untuk tanggal request
    const tglFormatted = this.formatDate(request.tanggal!);
    let positionJsonData: any[] = [];
    let usingLatestFallback = false;
    
    try {
      const orgData = await this.orgDataService.findOrg(tglFormatted);
      if (orgData?.position_json && Array.isArray(orgData.position_json)) {
        positionJsonData = orgData.position_json;
      }
    } catch (error) {
      console.log('Could not fetch position data from org_data for date:', tglFormatted);
    }
    
    // Fallback: If position_json is empty or position not found, try latest org_data
    if (positionJsonData.length === 0) {
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
            usingLatestFallback = true;
            console.log('Using latest org_data as fallback, date:', latestOrgData.tgl);
          }
        }
      } catch (error) {
        console.log('Could not fetch latest org_data');
      }
    }

    // Get details untuk menentukan status
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
    });

    // Determine status
    let status = 'Belum Diajukan';
    if (details.length > 0) {
      const hasBooking = details.some((d) => d.status === 'booking');
      const hasTerpakai = details.some((d) => d.status === 'terpakai' || d.status === 'terpakai_final');
      const allHangus = details.every((d) => d.status === 'hangus');
      const allDitolak = details.every((d) => d.status === 'ditolak');
      const hasRejected = details.some((d) => d.status === 'hangus' || d.status === 'ditolak');

      if (hasTerpakai) {
        status = 'Disetujui';
      } else if (allHangus || allDitolak || (hasRejected && !hasBooking && !hasTerpakai)) {
        status = 'Ditolak';
      } else if (hasBooking) {
        status = 'Menunggu Verifikasi';
      }
    }

    // Get position data
    const positionNumber = parseInt(request.position!, 10);
    const positionData = positionJsonData.find((p: any) => Number(p.position) === positionNumber);
    
    const persnum = positionData?.persnum_person || null;
    const nama = positionData?.persnum_person_text || null;

    // Get penandatangan position abbreviation
    let penandatanganPositionAbbreviation: string | null = null;
    
    if (request.idPositionPenandatangan) {
      const searchId = Number(request.idPositionPenandatangan);
      const penandatanganPosition = positionJsonData.find(
        (p: any) => Number(p.position) === searchId
      );
      
      if (penandatanganPosition) {
        penandatanganPositionAbbreviation = penandatanganPosition.position_abbreviation || penandatanganPosition.abbreviation || null;
        console.log('Found penandatangan position:', searchId, 'abbreviation:', penandatanganPositionAbbreviation);
      } else {
        console.log('Position', searchId, 'not found in org_data (using fallback:', usingLatestFallback, ')');
      }
    }

    // Generate template nomor
    const templateNomor = await this.generateNomorTemplate(request);

    // Build response dengan optional details jika sudah diajukan
    const responseData: any = {
      id: request.id,
      company: request.company!,
      area: request.area!,
      sub_area: request.subArea!,
      organization: request.organization!,
      position: request.position!,
      persnum,
      nama,
      tanggal: request.tanggal!,
      jenis: request.jenis!,
      klasifikasi: request.klasifikasi,
      perihal: request.perihal!,
      jumlah: request.jumlah!,
      penandatangan: request.penandatangan,
      penandatangan_position_id: request.idPositionPenandatangan,
      penandatangan_position_abbreviation: penandatanganPositionAbbreviation,
      template_nomor: templateNomor,
      created_at: request.createdAt,
      status,
    };

    // Tambahkan details jika sudah diajukan (ada file)
    if (details.length > 0) {
      let detailsWithUrls: any[];

      if (request.isSingleFile === 1) {
        // Single file mode: tampilkan hanya 1 detail dengan nomor range
        const firstDetail = details[0];
        const nomorList = details.map((d) => d.nomor).filter((n): n is string => !!n);
        let nomorRange: string | null = null;
        if (nomorList.length > 1) {
          nomorRange = `${nomorList[0]} - ${nomorList[nomorList.length - 1]}`;
        } else if (nomorList.length === 1) {
          nomorRange = nomorList[0];
        }

        detailsWithUrls = [{
          id: firstDetail.id,
          nomor: nomorRange,
          status: firstDetail.status,
          file_name: firstDetail.fileName,
          file_url: await this.getDetailFileUrlAndHeal(firstDetail, 'nomor'),
          created_at: firstDetail.createdAt,
        }];
      } else {
        detailsWithUrls = await Promise.all(
          details.map(async (d) => ({
            id: d.id,
            nomor: d.nomor,
            status: d.status,
            file_name: d.fileName,
            file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
            created_at: d.createdAt,
          }))
        );
      }

      responseData.details = detailsWithUrls;
    }

    responseData.is_single_file = request.isSingleFile;

    return {
      success: true,
      message: 'Detail usulan nomor berhasil diambil',
      data: responseData,
    };
  }

  /**
   * Helper: Generate template nomor (preview format dengan nomor urut kosong)
   */
  private async generateNomorTemplate(
    request: NomorRequestEntity,
  ): Promise<string | null> {
    try {
      if (!request.jenis) return null;

      // Ambil format dari jenis table
      const jenisData = await this.jenisRepository.findOne({
        where: { jenis: request.jenis },
      });

      if (!jenisData || !jenisData.formatPenomoran) {
        return null;
      }

      // Ambil data penandatangan dari position_json (same logic as getNomorRequestDetail)
      let penandatanganPositionAbbreviation: string | null = null;
      let penandatanganArea: string | null = null;

      if (request.idPositionPenandatangan) {
        const tglFormatted = this.formatDate(request.tanggal!);
        let positionJsonData: any[] = [];
        
        try {
          const orgData = await this.orgDataService.findOrg(tglFormatted);
          if (orgData?.position_json && Array.isArray(orgData.position_json)) {
            positionJsonData = orgData.position_json;
          }
        } catch (error) {
          // Fallback to latest org_data if date not found
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
          } catch (err) {
            console.log('Could not fetch org_data');
          }
        }

        const searchId = Number(request.idPositionPenandatangan);
        const penandatanganPosition = positionJsonData.find(
          (p: any) => Number(p.position) === searchId
        );
        
        if (penandatanganPosition) {
          penandatanganPositionAbbreviation = penandatanganPosition.position_abbreviation || penandatanganPosition.abbreviation || null;
          penandatanganArea = penandatanganPosition.area || null;
        }

        if (!penandatanganArea && request.area) {
          penandatanganArea = request.area;
        }
      } else {
        penandatanganArea = request.area;
      }

      // Generate template dengan nomor urut kosong
      const tahun = new Date(request.tanggal!).getFullYear();
      const bulan = new Date(request.tanggal!).getMonth() + 1;
      const bulanRomawi = this.getBulanRomawi(bulan);

      const jabatanCode = penandatanganPositionAbbreviation || '';
      const lokasiCode = this.extractAreaCode(penandatanganArea);
      const instansi = 'LPPNPI';

      // Ganti {NO_URUT} dengan dots, replace placeholder lainnya
      let template = jenisData.formatPenomoran
        .replace(/{NO_URUT}/g, '.....')
        .replace(/{TIPE}/g, request.jenis || '')
        .replace(/{INSTANSI}/g, instansi)
        .replace(/{JABATAN}/g, jabatanCode)
        .replace(/{LOKASI}/g, lokasiCode)
        .replace(/{KLASIFIKASI}/g, request.klasifikasi || '')
        .replace(/{BULAN}/g, bulanRomawi)
        .replace(/{TAHUN}/g, tahun.toString());

      return template;
    } catch (error) {
      console.log('Error generating nomor template:', error);
      return null;
    }
  }

  /**
   * Get detail penomoran (usulan + nomor request details)
   */
  async getNomorDetailPenomoran(
    requestId: string,
  ): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    // Get latest org_data untuk extract position details
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

    // Get details
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
      order: { createdAt: 'ASC' },
    });

    // Determine status
    let status = 'Belum Diajukan';
    if (details.length > 0) {
      const hasBooking = details.some((d) => d.status === 'booking');
      const hasTerpakai = details.some((d) => d.status === 'terpakai' || d.status === 'terpakai_final');
      const allHangus = details.every((d) => d.status === 'hangus');
      const allDitolak = details.every((d) => d.status === 'ditolak');
      const hasRejected = details.some((d) => d.status === 'hangus' || d.status === 'ditolak');

      if (hasTerpakai) {
        status = 'Disetujui';
      } else if (allHangus || allDitolak || (hasRejected && !hasBooking && !hasTerpakai)) {
        status = 'Ditolak';
      } else if (hasBooking) {
        status = 'Menunggu Verifikasi';
      }
    }

    // Get position data
    const positionNumber = parseInt(request.position!, 10);
    const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
    
    const persnum = positionData?.persnum_person || null;
    const nama = positionData?.persnum_person_text || null;

    // Generate signed URLs untuk details
    let detailsWithUrls: any[];

    if (request.isSingleFile === 1 && details.length > 0) {
      // Single file mode: tampilkan hanya 1 detail dengan nomor range
      const firstDetail = details[0];
      const nomorList = details.map((d) => d.nomor).filter((n): n is string => !!n);
      let nomorRange: string | null = null;
      if (nomorList.length > 1) {
        nomorRange = `${nomorList[0]} - ${nomorList[nomorList.length - 1]}`;
      } else if (nomorList.length === 1) {
        nomorRange = nomorList[0];
      }

      detailsWithUrls = [{
        id: firstDetail.id,
        nomor: nomorRange,
        status: firstDetail.status,
        file_name: firstDetail.fileName,
        file_text: firstDetail.fileText,
        file_url: await this.getDetailFileUrlAndHeal(firstDetail, 'nomor'),
        created_at: firstDetail.createdAt,
      }];
    } else {
      detailsWithUrls = await Promise.all(
        details.map(async (d) => ({
          id: d.id,
          nomor: d.nomor,
          status: d.status,
          file_name: d.fileName,
          file_text: d.fileText,
          file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
          created_at: d.createdAt,
        }))
      );
    }

    return {
      success: true,
      message: 'Detail penomoran berhasil diambil',
      data: {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum,
        nama,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status,
        is_single_file: request.isSingleFile,
        details: detailsWithUrls,
      },
    };
  }

  /**
   * User/Admin memproses usulan dan membuat booking nomor
   * Dengan file upload ke storage menggunakan folder query parameter
   * Mendukkan multiple file upload
   * 
   * Flow:
   * 1. Validasi request ada
   * 2. Jika action=replace, hapus detail lama dengan status booking (dan file di storage)
   * 3. Jika ada files, upload semua ke storage dengan folder path
   * 4. Buat detail record per file dengan status = 'booking' dan file key dari storage
   * 5. Jika tidak ada file, buat berdasarkan jumlah
   * 6. Return response dengan file information
   */
  async bookingNomorRequest(
    requestId: string,
    dto: BookingNomorRequestDto,
    files?: Express.Multer.File | Express.Multer.File[],
    folder: string = 'nomor',
    action: 'append' | 'replace' = 'append',
  ): Promise<BookingNomorRequestResponseDto> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    // Jika action = 'replace', hapus detail lama dengan status draft dan file-nya
    if (action === 'replace') {
      const oldDetails = await this.nomorRequestDetailRepository.find({
        where: { idRequest: requestId, status: 'draft' },
      });

      // Delete files dari storage untuk setiap detail
      for (const detail of oldDetails) {
        if (detail.fileText) {
          try {
            await this.storageService.deleteFile(detail.fileText);
            console.log(`Deleted old file from storage: ${detail.fileText}`);
          } catch (error) {
            // Log error tapi jangan throw, proses tetap lanjut
            console.log(`Failed to delete file ${detail.fileText}:`, error.message);
          }
        }
      }

      // Hapus detail dari database
      await this.nomorRequestDetailRepository.delete({
        idRequest: requestId,
        status: 'draft',
      });
    }

    const details: NomorRequestDetailEntity[] = [];

    // Normalize files ke array
    const fileArray = files
      ? Array.isArray(files)
        ? files
        : [files]
      : [];

    // Upload files jika ada
    if (fileArray && fileArray.length > 0) {
      for (const file of fileArray) {
        const detailId = uuidv4();
        let fileKey: string | null = null;
        const fileName: string | null = file.originalname;

        // Upload file ke storage dengan folder path
        try {
          const uploadResult = await this.storageService.uploadFile(file, folder);
          fileKey = uploadResult.key;
          console.log(`✅ File uploaded successfully: ${fileKey}`);
        } catch (error) {
          console.error(`❌ File upload error for ${fileName}:`, error.message);
          throw new BadRequestException(`Gagal upload file ${fileName}: ${error.message}`);
        }

        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: null,
          fileName: fileName,
          fileText: fileKey, // Simpan file key dari storage
          status: 'draft',
        });
        details.push(detail);
      }
    }

    // Tambah details tanpa file berdasarkan jumlah (untuk melengkapi total quantity)
    const jumlahDiajukan = dto.jumlah || request.jumlah || 0;
    const uploadedFileCount = fileArray.length;
    
    // Jika jumlah lebih besar dari file count, buat details tambahan tanpa file
    if (jumlahDiajukan > uploadedFileCount) {
      for (let i = uploadedFileCount; i < jumlahDiajukan; i++) {
        const detailId = uuidv4();
        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: null,
          fileName: null,
          fileText: null,
          status: 'draft',
        });
        details.push(detail);
      }
    }

    // Validasi: minimal harus ada 1 detail (file atau quantity)
    if (details.length === 0) {
      throw new BadRequestException(
        'Minimal harus upload file atau mengisi jumlah nomor yang diajukan'
      );
    }

    await this.nomorRequestDetailRepository.save(details);

    // Generate signed URLs untuk files yang berhasil di-upload
    const detailsWithUrls = await Promise.all(
      details.map(async (detail) => ({
        id: detail.id,
        status: detail.status,
        file_name: detail.fileName,
        file_text: detail.fileText,
        file_url: await this.getDetailFileUrlAndHeal(detail, folder),
        created_at: detail.createdAt,
      }))
    );

    // Hitung berapa file dan berapa nomor tanpa file
    const fileCount = details.filter((d) => d.fileText).length;
    const noFileCount = details.filter((d) => !d.fileText).length;

    let resultMessage = `Berhasil booking ${details.length} nomor`;
    if (fileCount > 0 && noFileCount > 0) {
      resultMessage = `Berhasil booking ${details.length} nomor (${fileCount} dengan file, ${noFileCount} tanpa file)`;
    } else if (fileCount > 0) {
      resultMessage = `Berhasil booking ${fileCount} nomor dengan file`;
    } else if (noFileCount > 0) {
      resultMessage = `Berhasil booking ${noFileCount} nomor (tanpa file)`;
    }

    return {
      success: true,
      message: resultMessage,
      data: {
        request_id: requestId,
        details: detailsWithUrls,
      },
    };
  }

  /**
   * User/Admin memproses usulan dan membuat booking nomor
   * Upload SATU file yang akan di-assign ke SEMUA request detail
   * Semua detail akan memiliki file path yang sama
   *
   * Flow:
   * 1. Validasi request ada
   * 2. Jika action=replace, hapus detail lama dengan status booking (dan file di storage)
   * 3. Upload satu file ke storage
   * 4. Buat detail records sesuai jumlah, semua dengan file key yang sama
   * 5. Return response dengan file information
   */
  async bookingNomorRequestSingleFile(
    requestId: string,
    dto: BookingNomorRequestDto,
    file?: Express.Multer.File,
    folder: string = 'nomor',
    action: 'append' | 'replace' = 'append',
  ): Promise<BookingNomorRequestResponseDto> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    // Jika action = 'replace', hapus detail lama dengan status draft dan file-nya
    if (action === 'replace') {
      const oldDetails = await this.nomorRequestDetailRepository.find({
        where: { idRequest: requestId, status: 'draft' },
      });

      // Collect unique file keys untuk dihapus (hindari double delete)
      const uniqueFileKeys = new Set<string>();
      for (const detail of oldDetails) {
        if (detail.fileText) {
          uniqueFileKeys.add(detail.fileText);
        }
      }

      // Delete unique files dari storage
      for (const fileKey of uniqueFileKeys) {
        try {
          await this.storageService.deleteFile(fileKey);
          console.log(`Deleted old file from storage: ${fileKey}`);
        } catch (error) {
          console.log(`Failed to delete file ${fileKey}:`, error.message);
        }
      }

      // Hapus detail dari database
      await this.nomorRequestDetailRepository.delete({
        idRequest: requestId,
        status: 'draft',
      });
    }

    // Upload satu file jika ada
    let fileKey: string | null = null;
    let fileName: string | null = null;

    if (file) {
      fileName = file.originalname;
      try {
        const uploadResult = await this.storageService.uploadFile(file, folder);
        fileKey = uploadResult.key;
        console.log(`✅ File uploaded successfully (single): ${fileKey}`);
      } catch (error) {
        console.error(`❌ File upload error for ${fileName}:`, error.message);
        throw new BadRequestException(`Gagal upload file ${fileName}: ${error.message}`);
      }
    }

    // Tentukan jumlah detail yang akan dibuat
    const jumlahDiajukan = dto.jumlah || request.jumlah || 0;

    if (jumlahDiajukan <= 0 && !file) {
      throw new BadRequestException(
        'Minimal harus upload file atau mengisi jumlah nomor yang diajukan',
      );
    }

    const totalDetails = jumlahDiajukan > 0 ? jumlahDiajukan : 1;

    // Buat semua details dengan file path yang sama
    const details: NomorRequestDetailEntity[] = [];
    for (let i = 0; i < totalDetails; i++) {
      const detailId = uuidv4();
      const detail = this.nomorRequestDetailRepository.create({
        id: detailId,
        idRequest: requestId,
        nomor: null,
        fileName: fileName,
        fileText: fileKey,
        status: 'draft',
      });
      details.push(detail);
    }

    await this.nomorRequestDetailRepository.save(details);

    // Tandai request sebagai single file
    request.isSingleFile = 1;
    await this.nomorRequestRepository.save(request);

    // Generate signed URL sekali saja karena semua detail pakai file yang sama
    let fileUrl: string | null = null;
    if (fileKey) {
      fileUrl = await this.storageService.getFileUrl(fileKey);
    }

    const detailsWithUrls = details.map((detail) => ({
      id: detail.id,
      status: detail.status,
      file_name: detail.fileName,
      file_text: detail.fileText,
      file_url: fileUrl,
      created_at: detail.createdAt,
    }));

    const resultMessage = file
      ? `Berhasil booking ${totalDetails} nomor dengan 1 file yang sama`
      : `Berhasil booking ${totalDetails} nomor (tanpa file)`;

    return {
      success: true,
      message: resultMessage,
      data: {
        request_id: requestId,
        details: detailsWithUrls,
      },
    };
  }

  /**
   * User/Admin update file di detail yang masih booking
   * Untuk replace lampiran sebelum approve
   */
  async updateNomorRequestDetailFile(
    detailId: string,
    file: Express.Multer.File,
    folder: string = 'nomor',
  ): Promise<any> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
    }

    if (detail.status !== 'booking') {
      throw new BadRequestException(
        `Tidak dapat update file untuk detail dengan status: ${detail.status}. Hanya detail dengan status 'booking' yang bisa diupdate.`,
      );
    }

    // Delete file lama dari storage jika ada
    if (detail.fileText) {
      try {
        await this.storageService.deleteFile(detail.fileText);
        console.log(`Deleted old file from storage: ${detail.fileText}`);
      } catch (error) {
        console.log(`Failed to delete old file ${detail.fileText}:`, error.message);
      }
    }

    // Upload file baru ke storage
    let fileKey: string | null = null;
    try {
      const uploadResult = await this.storageService.uploadFile(file, folder);
      fileKey = uploadResult.key;
    } catch (error) {
      throw new BadRequestException(`Gagal upload file ${file.originalname}: ${error.message}`);
    }

    // Update detail dengan file baru
    detail.fileName = file.originalname;
    detail.fileText = fileKey;
    await this.nomorRequestDetailRepository.save(detail);

    return {
      success: true,
      message: 'File berhasil diupdate',
      data: {
        id: detail.id,
        file_name: detail.fileName,
        file_text: detail.fileText,
        status: detail.status,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Admin upload file final untuk detail dengan status terpakai
   * Upload file dan ubah status menjadi terpakai_final
   */
  async uploadFileToTerpakaiAkhir(
    detailId: string,
    file: Express.Multer.File,
    folder: string = 'nomor',
  ): Promise<any> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
    }

    if (detail.status !== 'terpakai') {
      throw new BadRequestException(
        `Tidak dapat upload file untuk detail dengan status: ${detail.status}. Hanya detail dengan status 'terpakai' yang bisa diupload file final.`,
      );
    }

    // Delete file lama dari storage jika ada
    if (detail.fileText) {
      try {
        await this.storageService.deleteFile(detail.fileText);
        console.log(`Deleted old file from storage: ${detail.fileText}`);
      } catch (error) {
        console.log(`Failed to delete old file ${detail.fileText}:`, error.message);
      }
    }

    // Upload file baru ke storage
    let fileKey: string | null = null;
    try {
      const uploadResult = await this.storageService.uploadFile(file, folder);
      fileKey = uploadResult.key;
      console.log(`✅ File uploaded successfully for terpakai_final: ${fileKey}`);
    } catch (error) {
      throw new BadRequestException(`Gagal upload file ${file.originalname}: ${error.message}`);
    }

    // Update detail dengan file baru dan ubah status ke terpakai_final
    detail.fileName = file.originalname;
    detail.fileText = fileKey;
    detail.status = 'terpakai_final';
    await this.nomorRequestDetailRepository.save(detail);

    return {
      success: true,
      message: 'File berhasil diupload dan status berubah menjadi terpakai_final',
      data: {
        id: detail.id,
        nomor: detail.nomor,
        file_name: detail.fileName,
        file_text: detail.fileText,
        status: detail.status,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Admin menyetujui usulan dan generate nomor
   * 
   * Flow:
   * 1. Ambil nomor terakhir dari tabel nomor (dengan locking)
   * 2. Generate nomor baru
   * 3. Update nomor_request_detail: status = 'terpakai', nomor = nomor baru
   * 4. Insert data ke tabel nomor sebagai nomor resmi
   * 
   * Menggunakan transaction dan locking untuk mencegah duplikasi
   */
  async approveNomorRequestDetail(
    detailId: string,
    dto: ApproveNomorRequestDetailDto,
  ): Promise<ApproveNomorRequestDetailResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Ambil detail dengan locking
      const detail = await queryRunner.manager.findOne(NomorRequestDetailEntity, {
        where: { id: detailId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!detail) {
        throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
      }

      if (detail.status !== 'booking') {
        throw new BadRequestException(
          `Detail nomor sudah diproses dengan status: ${detail.status}`,
        );
      }

      // 2. Ambil request untuk mendapatkan info
      const request = await queryRunner.manager.findOne(NomorRequestEntity, {
        where: { id: detail.idRequest! },
      });

      if (!request) {
        throw new NotFoundException(`Request nomor tidak ditemukan`);
      }

      const tahun = new Date(request.tanggal!).getFullYear();

      // 3. Validasi jenis ada
      if (!request.jenis) {
        throw new BadRequestException('Jenis nomor tidak ditemukan pada request');
      }

      // 4. Ambil format penomoran dari tabel jenis
      const jenisData = await queryRunner.manager.findOne(JenisEntity, {
        where: { jenis: request.jenis },
      });

      if (!jenisData || !jenisData.formatPenomoran) {
        throw new BadRequestException(
          `Format penomoran untuk jenis ${request.jenis} tidak ditemukan`,
        );
      }

      // 5. Ambil nomor terakhir dari tabel nomor dengan locking
      // Parameter counter berbeda untuk ND/DI vs jenis lainnya:
      // - ND & DI: Company + Position + Jenis + Tahun
      // - Lainnya: Company + Area + Jenis + Tahun
      const isNdOrDi = request.jenis === 'ND' || request.jenis === 'DI';
      
      let queryBuilder = queryRunner.manager
        .createQueryBuilder(NomorEntity, 'n')
        .where('n.tahun = :tahun', { tahun })
        .andWhere('n.jenis = :jenis', { jenis: request.jenis })
        .andWhere('n.company = :company', { company: request.company });

      if (isNdOrDi) {
        // ND & DI: gunakan position sebagai parameter
        queryBuilder = queryBuilder.andWhere('n.position = :position', { position: request.position });
      } else {
        // Jenis lainnya: gunakan area sebagai parameter
        queryBuilder = queryBuilder.andWhere('n.area = :area', { area: request.area });
      }

      const nomorRecord = await queryBuilder
        .setLock('pessimistic_write')
        .getOne();

      // 6. Generate nomor urut baru (increment dari nomor terakhir)
      let noUrut = 1;
      if (nomorRecord && nomorRecord.nomor) {
        // Nomor di database sudah integer, tinggal increment
        noUrut = nomorRecord.nomor + 1;
      }

      // 7. Ambil data penandatangan untuk position abbreviation, lokasi, dan instansi
      let penandatanganPositionAbbreviation: string | null = null;
      let penandatanganArea: string | null = null;

      if (request.idPositionPenandatangan) {
        const tglFormatted = this.formatDate(request.tanggal!);
        let positionJsonData: any[] = [];
        
        try {
          const orgData = await this.orgDataService.findOrg(tglFormatted);
          if (orgData?.position_json && Array.isArray(orgData.position_json)) {
            positionJsonData = orgData.position_json;
          }
        } catch (error) {
          // Fallback to latest org_data if date not found
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
          } catch (err) {
            console.log('Could not fetch org_data for single approve');
          }
        }

        const searchId = Number(request.idPositionPenandatangan);
        const penandatanganPosition = positionJsonData.find(
          (p: any) => Number(p.position) === searchId
        );
        
        if (penandatanganPosition) {
          penandatanganPositionAbbreviation = penandatanganPosition.position_abbreviation || penandatanganPosition.abbreviation || null;
          penandatanganArea = penandatanganPosition.area || null;
        }

        // Fallback: gunakan area dari request jika tidak ditemukan dari position lookup
        if (!penandatanganArea && request.area) {
          penandatanganArea = request.area;
        }

        // Log untuk debugging
        console.log('Penandatangan lookup (single):', {
          detailId: detailId,
          idPositionPenandatangan: request.idPositionPenandatangan,
          found: !!penandatanganPosition,
          abbreviation: penandatanganPositionAbbreviation,
          area: penandatanganArea,
        });
      } else {
        // Jika idPositionPenandatangan tidak ada, gunakan area dari request
        penandatanganArea = request.area;
        console.log('Penandatangan lookup (single): idPositionPenandatangan is null, using request area');
      }

      // Generate nomor menggunakan format dari tabel jenis dengan data penandatangan
      const nomorBaru = await this.generateNomorFromFormat(
        jenisData.formatPenomoran,
        noUrut,
        request,
        tahun,
        penandatanganPositionAbbreviation,
        penandatanganArea,
      );

      // 8. Update detail: status = 'terpakai', nomor = nomor baru
      detail.status = 'terpakai';
      detail.nomor = nomorBaru;
      // Preserve existing file information, don't overwrite with null
      if (dto.file_name !== undefined) {
        detail.fileName = dto.file_name;
      }
      if (dto.file_text !== undefined) {
        detail.fileText = dto.file_text;
      }
      await queryRunner.manager.save(detail);

      // 9. UPSERT ke tabel nomor (update counter jika ada, insert jika belum)
      if (nomorRecord) {
        // Update nomor urut terakhir (integer) dan data terbaru
        nomorRecord.nomor = noUrut;
        nomorRecord.area = request.area;
        nomorRecord.subArea = request.subArea;
        nomorRecord.organization = request.organization;
        nomorRecord.position = request.position;
        nomorRecord.updatedAt = new Date();
        await queryRunner.manager.save(nomorRecord);
      } else {
        // Insert record baru sebagai counter dengan semua field
        const nomorId = uuidv4();
        const nomor = this.nomorRepository.create({
          id: nomorId,
          company: request.company,
          area: request.area,
          subArea: request.subArea,
          organization: request.organization,
          position: request.position,
          tahun,
          jenis: request.jenis,
          nomor: noUrut,
        });
        await queryRunner.manager.save(nomor);
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Nomor berhasil disetujui dan digenerate',
        data: {
          id: detail.id,
          nomor: detail.nomor,
          status: detail.status,
          file_name: detail.fileName,
          file_text: detail.fileText,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Admin menolak usulan
   * status = 'hangus', nomor tetap NULL, file dihapus dari storage
   */
  async rejectNomorRequestDetail(
    detailId: string,
  ): Promise<RejectNomorRequestDetailResponseDto> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
    }

    if (detail.status !== 'booking') {
      throw new BadRequestException(
        `Detail nomor sudah diproses dengan status: ${detail.status}`,
      );
    }

    detail.status = 'hangus';
    await this.nomorRequestDetailRepository.save(detail);

    return {
      success: true,
      message: 'Nomor berhasil ditolak',
      data: {
        id: detail.id,
        status: detail.status,
      },
    };
  }

  /**
   * Admin menyetujui banyak usulan sekaligus
   */
  async approveBulkNomorRequestDetail(
    dto: ApproveBulkNomorRequestDetailDto,
  ): Promise<ApproveBulkNomorRequestDetailResponseDto> {
    const results: {
      id: string;
      nomor: string | null;
      status: string;
      success: boolean;
      error?: string;
    }[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const detailId of dto.detail_ids) {
      try {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
          // 1. Ambil detail dengan locking
          const detail = await queryRunner.manager.findOne(NomorRequestDetailEntity, {
            where: { id: detailId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!detail) {
            throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
          }

          if (detail.status !== 'booking') {
            throw new BadRequestException(
              `Detail nomor sudah diproses dengan status: ${detail.status}`,
            );
          }

          // 2. Ambil request untuk mendapatkan info
          const request = await queryRunner.manager.findOne(NomorRequestEntity, {
            where: { id: detail.idRequest! },
          });

          if (!request) {
            throw new NotFoundException(`Request nomor tidak ditemukan`);
          }

          const tahun = new Date(request.tanggal!).getFullYear();

          // 3. Validasi jenis ada
          if (!request.jenis) {
            throw new BadRequestException('Jenis nomor tidak ditemukan pada request');
          }

          // 4. Ambil format penomoran dari tabel jenis
          const jenisData = await queryRunner.manager.findOne(JenisEntity, {
            where: { jenis: request.jenis },
          });

          if (!jenisData || !jenisData.formatPenomoran) {
            throw new BadRequestException(
              `Format penomoran untuk jenis ${request.jenis} tidak ditemukan`,
            );
          }

          // 5. Ambil nomor terakhir dari tabel nomor dengan locking
          // Parameter counter berbeda untuk ND/DI vs jenis lainnya:
          // - ND & DI: Company + Position + Jenis + Tahun
          // - Lainnya: Company + Area + Jenis + Tahun
          const isNdOrDi = request.jenis === 'ND' || request.jenis === 'DI';
          
          let queryBuilder = queryRunner.manager
            .createQueryBuilder(NomorEntity, 'n')
            .where('n.tahun = :tahun', { tahun })
            .andWhere('n.jenis = :jenis', { jenis: request.jenis })
            .andWhere('n.company = :company', { company: request.company });

          if (isNdOrDi) {
            // ND & DI: gunakan position sebagai parameter
            queryBuilder = queryBuilder.andWhere('n.position = :position', { position: request.position });
          } else {
            // Jenis lainnya: gunakan area sebagai parameter
            queryBuilder = queryBuilder.andWhere('n.area = :area', { area: request.area });
          }

          const nomorRecord = await queryBuilder
            .setLock('pessimistic_write')
            .getOne();

          // 6. Generate nomor urut baru (increment dari nomor terakhir)
          let noUrut = 1;
          if (nomorRecord && nomorRecord.nomor) {
            // Nomor di database sudah integer, tinggal increment
            noUrut = nomorRecord.nomor + 1;
          }

          // 7. Ambil data penandatangan untuk position abbreviation, lokasi, dan instansi
          let penandatanganPositionAbbreviation: string | null = null;
          let penandatanganArea: string | null = null;

          if (request.idPositionPenandatangan) {
            const tglFormatted = this.formatDate(request.tanggal!);
            let positionJsonData: any[] = [];
            
            try {
              const orgData = await this.orgDataService.findOrg(tglFormatted);
              if (orgData?.position_json && Array.isArray(orgData.position_json)) {
                positionJsonData = orgData.position_json;
              }
            } catch (error) {
              // Fallback to latest org_data if date not found
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
              } catch (err) {
                console.log('Could not fetch org_data for bulk approve');
              }
            }

            const searchId = Number(request.idPositionPenandatangan);
            const penandatanganPosition = positionJsonData.find(
              (p: any) => Number(p.position) === searchId
            );
            
            if (penandatanganPosition) {
              penandatanganPositionAbbreviation = penandatanganPosition.position_abbreviation || penandatanganPosition.abbreviation || null;
              penandatanganArea = penandatanganPosition.area || null;
            }

            // Fallback: gunakan area dari request jika tidak ditemukan dari position lookup
            if (!penandatanganArea && request.area) {
              penandatanganArea = request.area;
            }

            // Log untuk debugging
            console.log('Penandatangan lookup (bulk):', {
              detailId: detailId,
              idPositionPenandatangan: request.idPositionPenandatangan,
              found: !!penandatanganPosition,
              abbreviation: penandatanganPositionAbbreviation,
              area: penandatanganArea,
            });
          } else {
            // Jika idPositionPenandatangan tidak ada, gunakan area dari request
            penandatanganArea = request.area;
            console.log('Penandatangan lookup (bulk): idPositionPenandatangan is null, using request area');
          }

          // Generate nomor menggunakan format dari tabel jenis dengan data penandatangan
          const nomorBaru = await this.generateNomorFromFormat(
            jenisData.formatPenomoran,
            noUrut,
            request,
            tahun,
            penandatanganPositionAbbreviation,
            penandatanganArea,
          );

          // 8. Update detail: status = 'terpakai', nomor = nomor baru
          detail.status = 'terpakai';
          detail.nomor = nomorBaru;
          // Preserve existing file information, don't overwrite with null
          if (dto.file_name !== undefined) {
            detail.fileName = dto.file_name;
          }
          if (dto.file_text !== undefined) {
            detail.fileText = dto.file_text;
          }
          await queryRunner.manager.save(detail);

          // 9. UPSERT ke tabel nomor (update counter jika ada, insert jika belum)
          if (nomorRecord) {
            // Update nomor urut terakhir (integer) dan data terbaru
            nomorRecord.nomor = noUrut;
            nomorRecord.area = request.area;
            nomorRecord.subArea = request.subArea;
            nomorRecord.organization = request.organization;
            nomorRecord.position = request.position;
            nomorRecord.updatedAt = new Date();
            await queryRunner.manager.save(nomorRecord);
          } else {
            // Insert record baru sebagai counter dengan semua field
            const nomorId = uuidv4();
            const nomor = this.nomorRepository.create({
              id: nomorId,
              company: request.company,
              area: request.area,
              subArea: request.subArea,
              organization: request.organization,
              position: request.position,
              tahun,
              jenis: request.jenis,
              nomor: noUrut,
            });
            await queryRunner.manager.save(nomor);
          }

          await queryRunner.commitTransaction();

          results.push({
            id: detail.id,
            nomor: detail.nomor,
            status: detail.status,
            success: true,
          });
          successCount++;
        } catch (error) {
          await queryRunner.rollbackTransaction();
          results.push({
            id: detailId,
            nomor: null,
            status: 'booking',
            success: false,
            error: error.message,
          });
          failedCount++;
        } finally {
          await queryRunner.release();
        }
      } catch (error) {
        results.push({
          id: detailId,
          nomor: null,
          status: 'booking',
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    return {
      success: true,
      message: `Selesai memproses ${dto.detail_ids.length} detail: ${successCount} berhasil, ${failedCount} gagal`,
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results,
      },
    };
  }

  /**
   * Admin menolak banyak usulan sekaligus
   */
  async rejectBulkNomorRequestDetail(
    dto: RejectBulkNomorRequestDetailDto,
  ): Promise<RejectBulkNomorRequestDetailResponseDto> {
    const results: {
      id: string;
      status: string;
      success: boolean;
      error?: string;
    }[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const detailId of dto.detail_ids) {
      try {
        const detail = await this.nomorRequestDetailRepository.findOne({
          where: { id: detailId },
        });

        if (!detail) {
          throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
        }

        if (detail.status !== 'booking') {
          throw new BadRequestException(
            `Detail nomor sudah diproses dengan status: ${detail.status}`,
          );
        }

        detail.status = 'hangus';
        await this.nomorRequestDetailRepository.save(detail);

        results.push({
          id: detail.id,
          status: detail.status,
          success: true,
        });
        successCount++;
      } catch (error) {
        results.push({
          id: detailId,
          status: 'booking',
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    return {
      success: true,
      message: `Selesai memproses ${dto.detail_ids.length} detail: ${successCount} berhasil, ${failedCount} gagal`,
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results,
      },
    };
  }

  /**
   * Admin mengubah status detail menjadi hangus
   * Bisa digunakan untuk nomor dengan status apapun (terpakai, terpakai_final, booking, dll)
   */
  async setStatusHangus(
    detailId: string,
  ): Promise<any> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(`Detail nomor dengan ID ${detailId} tidak ditemukan`);
    }

    // Simpan status lama untuk log
    const oldStatus = detail.status;

    // Update status menjadi hangus
    detail.status = 'hangus';
    await this.nomorRequestDetailRepository.save(detail);

    return {
      success: true,
      message: `Status berhasil diubah dari ${oldStatus} menjadi hangus`,
      data: {
        id: detail.id,
        nomor: detail.nomor,
        old_status: oldStatus,
        new_status: detail.status,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Get semua nomor yang sudah jadi (dari nomor_request_detail dengan status terpakai, terpakai_final, atau hangus)
   * OPTIMIZED: Pagination per usulan (request), output tetap flat per nomor
   */
  async getNomor(query: GetNomorQueryDto): Promise<GetNomorResponseDto> {
    // Load requests yang memiliki nomor dengan status terpakai/hangus
    const requests = await this.nomorRequestRepository.find({
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Process dan filter requests yang memiliki nomor jadi
    const usulanData = requests.map((request) => {
      // Filter details hanya yang sudah jadi (terpakai, terpakai_final, hangus)
      const validDetails = (request.details || []).filter(
        (d) => d.status === 'terpakai' || d.status === 'terpakai_final' || d.status === 'hangus'
      );

      // Skip jika tidak ada nomor yang sudah jadi
      if (validDetails.length === 0) {
        return null;
      }

      // Apply filter tahun jika ada
      if (query.tahun) {
        const requestTahun = new Date(request.tanggal!).getFullYear();
        if (requestTahun !== query.tahun) {
          return null;
        }
      }

      // Apply search filter (search di nomor, perihal, atau jenis)
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        const nomorMatch = validDetails.some(
          (d) => d.nomor && d.nomor.toLowerCase().includes(searchLower)
        );
        const perihalMatch = request.perihal && request.perihal.toLowerCase().includes(searchLower);
        const jenisMatch = request.jenis && request.jenis.toLowerCase().includes(searchLower);
        
        if (!nomorMatch && !perihalMatch && !jenisMatch) {
          return null;
        }
      }

      // Get position data pengusul
      const positionNumber = parseInt(request.position || '0', 10);
      const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
      const namaPengirim = positionData?.persnum_person_text || null;

      // Get position data penandatangan
      let jabatan = null;
      if (request.idPositionPenandatangan) {
        const penandatanganPosition = positionJsonData.find(
          (p: any) => Number(p.position) === Number(request.idPositionPenandatangan)
        );
        jabatan = penandatanganPosition?.position_text || null;
      }

      // Sort details by createdAt DESC (terbaru di atas)
      validDetails.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Waktu usulan = waktu nomor terakhir yang dibuat (untuk sorting)
      const latestDetailTime = validDetails.length > 0 ? validDetails[0].createdAt : request.createdAt;

      return {
        request,
        jabatan,
        namaPengirim,
        waktu: latestDetailTime,
        details: validDetails,
      };
    });

    // Filter out null values
    const filteredUsulan = usulanData.filter((item) => item !== null);

    // Apply sorting (default by waktu DESC - terbaru di atas)
    const sortOrder = query?.sort_order?.toLowerCase() === 'asc' ? 1 : -1;
    if (query?.sort_by) {
      filteredUsulan.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (query.sort_by === 'tanggal') {
          aValue = a.request.tanggal ? new Date(a.request.tanggal).getTime() : 0;
          bValue = b.request.tanggal ? new Date(b.request.tanggal).getTime() : 0;
        } else if (query.sort_by === 'tanggal_usulan' || query.sort_by === 'waktu') {
          aValue = new Date(a.waktu).getTime();
          bValue = new Date(b.waktu).getTime();
        } else if (query.sort_by === 'jenis') {
          aValue = (a.request.jenis || '').toLowerCase();
          bValue = (b.request.jenis || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else {
          return 0;
        }

        return (aValue - bValue) * sortOrder;
      });
    } else {
      // Default sort by waktu DESC
      filteredUsulan.sort((a, b) => new Date(b.waktu).getTime() - new Date(a.waktu).getTime());
    }

    // Apply pagination (per usulan, bukan per nomor)
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = filteredUsulan.length;  // Total usulan
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedUsulan = filteredUsulan.slice(skip, skip + limit);

    // Flatten ke format per-nomor untuk response
    const flatData = paginatedUsulan.flatMap((item) => {
      if (item.request.isSingleFile === 1 && item.details.length > 0) {
        // Single file mode: tampilkan 1 row dengan nomor range
        const firstDetail = item.details[0];
        const nomorList = item.details.map((d) => d.nomor).filter((n): n is string => !!n);
        let nomorRange: string | null = null;
        if (nomorList.length > 1) {
          nomorRange = `${nomorList[0]} - ${nomorList[nomorList.length - 1]}`;
        } else if (nomorList.length === 1) {
          nomorRange = nomorList[0];
        }
        return [{
          id: firstDetail.id,
          id_request: item.request.id,
          jenis: item.request.jenis,
          jabatan: item.jabatan,
          klasifikasi: item.request.klasifikasi,
          perihal: item.request.perihal,
          tanggal: item.request.tanggal,
          nomor: nomorRange,
          status: firstDetail.status,
          nama_pengirim: item.namaPengirim,
          waktu: firstDetail.createdAt,
        }];
      }
      return item.details.map((detail) => ({
        id: detail.id,
        id_request: item.request.id,
        jenis: item.request.jenis,
        jabatan: item.jabatan,
        klasifikasi: item.request.klasifikasi,
        perihal: item.request.perihal,
        tanggal: item.request.tanggal,
        nomor: detail.nomor,
        status: detail.status,
        nama_pengirim: item.namaPengirim,
        waktu: detail.createdAt,
      }));
    });

    return {
      success: true,
      message: 'Data nomor berhasil diambil',
      data: flatData,
      pagination: {
        page,
        limit,
        total,          // Total usulan (bukan nomor)
        totalPages,
      },
    };
  }

  /**
   * Get nomor by id request (menampilkan semua nomor dalam satu request)
   * OPTIMIZED: Menggunakan caching untuk position data
   */
  async getNomorById(idRequest: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: idRequest },
    });

    if (!request) {
      throw new Error('Nomor request not found');
    }

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Get position data penandatangan untuk jabatan
    let jabatan = null;
    if (request.idPositionPenandatangan) {
      const penandatanganPosition = positionJsonData.find(
        (p: any) => Number(p.position) === Number(request.idPositionPenandatangan)
      );
      jabatan = penandatanganPosition?.position_text || null;
    }

    // Get all request details for this request (nomor yang sudah jadi ada di sini)
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest },
      order: { createdAt: 'ASC' },
    });

    const validDetails = details.filter(
      (d) => (d.status === 'terpakai' || d.status === 'terpakai_final' || d.status === 'hangus') && d.nomor,
    );

    // Generate signed URLs untuk nomor_list
    let nomorListWithUrls: any[];

    if (request.isSingleFile === 1 && validDetails.length > 0) {
      // Single file mode: tampilkan hanya 1 entry dengan nomor range
      const firstDetail = validDetails[0];
      const nomorList = validDetails.map((d) => d.nomor).filter((n): n is string => !!n);
      let nomorRange: string | null = null;
      if (nomorList.length > 1) {
        nomorRange = `${nomorList[0]} - ${nomorList[nomorList.length - 1]}`;
      } else if (nomorList.length === 1) {
        nomorRange = nomorList[0];
      }

      nomorListWithUrls = [{
        id: firstDetail.id,
        nomor: nomorRange,
        status: firstDetail.status,
        file_name: firstDetail.fileName || null,
        file_text: firstDetail.fileText || null,
        file_url: await this.getDetailFileUrlAndHeal(firstDetail, 'nomor'),
        created_at: firstDetail.createdAt,
      }];
    } else {
      nomorListWithUrls = await Promise.all(
        validDetails.map(async (d) => ({
          id: d.id,
          nomor: d.nomor,
          status: d.status,
          file_name: d.fileName || null,
          file_text: d.fileText || null,
          file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
          created_at: d.createdAt,
        }))
      );
    }

    return {
      success: true,
      message: 'Data nomor berhasil diambil',
      data: {
        id: request.id,
        jenis: request.jenis,
        jabatan,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal,
        tanggal: request.tanggal,
        jumlah: request.jumlah,
        is_single_file: request.isSingleFile,
        nomor_list: nomorListWithUrls,
      },
    };
  }

  /**
   * Hapus usulan nomor dan semua detailnya (plus file di storage)
   */
  async deleteNomorRequest(
    requestId: string,
  ): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    // Ambil semua detail untuk hapus file dari storage
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
    });

    // Delete semua file dari storage
    for (const detail of details) {
      if (detail.fileText) {
        try {
          await this.storageService.deleteFile(detail.fileText);
          console.log(`Deleted file from storage on delete request: ${detail.fileText}`);
        } catch (error) {
          console.log(`Failed to delete file ${detail.fileText}:`, error.message);
        }
      }
    }

    // Delete semua detail terkait
    await this.nomorRequestDetailRepository.delete({ idRequest: requestId });

    // Delete request
    await this.nomorRequestRepository.delete({ id: requestId });

    return {
      success: true,
      message: 'Usulan nomor berhasil dihapus',
      data: {
        id: requestId,
        deleted_at: new Date(),
      },
    };
  }

  /**
   * Tolak semua nomor dalam satu request (set semua details status = 'ditolak')
   */
  async rejectAllNomorRequest(
    requestId: string,
  ): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    // Get semua details untuk request ini
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
    });

    if (details.length === 0) {
      throw new BadRequestException(
        `Tidak ada nomor yang diajukan untuk usulan dengan ID ${requestId}`,
      );
    }

    // Update semua details yang belum diproses menjadi ditolak
    const rejectedDetails: { id: string; status: string }[] = [];
    
    for (const detail of details) {
      // Hanya set ditolak jika status masih booking
      if (detail.status === 'booking') {
        detail.status = 'ditolak';
        await this.nomorRequestDetailRepository.save(detail);
        rejectedDetails.push({
          id: detail.id,
          status: detail.status,
        });
      }
    }

    return {
      success: true,
      message: `${rejectedDetails.length} nomor berhasil ditolak`,
      data: {
        request_id: requestId,
        total_rejected: rejectedDetails.length,
        rejected_details: rejectedDetails,
      },
    };
  }

  /**
   * Penandatangan melihat daftar usulan yang menunggu persetujuannya (status detail = draft)
   * position_id diambil dari bearer token
   */
  async getPendingApproval(positionId: number, query?: GetNomorQueryDto): Promise<any> {
    // Ambil semua request yang penandatangannya adalah posisi ini
    const requests = await this.nomorRequestRepository.find({
      where: { idPositionPenandatangan: positionId },
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Filter hanya yang punya detail dengan status draft
    const pendingRequests = requests.filter((r) =>
      (r.details || []).some((d) => d.status === 'draft'),
    );

    const positionJsonData = await this.getLatestPositionJsonData();

    const data = await Promise.all(
      pendingRequests.map(async (request) => {
        const details = (request.details || []).filter((d) => d.status === 'draft');
        const positionNumber = parseInt(request.position!, 10);
        const positionData = positionJsonData.find((p: any) => p.position === positionNumber);

        return {
          id: request.id,
          company: request.company,
          area: request.area,
          sub_area: request.subArea,
          organization: request.organization,
          position: request.position,
          nama: positionData?.persnum_person_text || null,
          tanggal: request.tanggal,
          jenis: request.jenis,
          klasifikasi: request.klasifikasi,
          perihal: request.perihal,
          jumlah: request.jumlah,
          penandatangan: request.penandatangan,
          is_single_file: request.isSingleFile,
          created_at: request.createdAt,
          details: request.isSingleFile === 1 && details.length > 0
            ? [{
                id: details[0].id,
                status: details[0].status,
                file_name: details[0].fileName,
                file_url: await this.getDetailFileUrlAndHeal(details[0], 'nomor'),
                created_at: details[0].createdAt,
              }]
            : await Promise.all(
                details.map(async (d) => ({
                  id: d.id,
                  status: d.status,
                  file_name: d.fileName,
                  file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
                  created_at: d.createdAt,
                })),
              ),
        };
      }),
    );

    // Apply search
    let filteredData = data;
    if (query?.search) {
      const searchLower = query.search.toLowerCase();
      filteredData = data.filter(
        (item) =>
          item.perihal?.toLowerCase().includes(searchLower) ||
          item.jenis?.toLowerCase().includes(searchLower) ||
          item.klasifikasi?.toLowerCase().includes(searchLower) ||
          item.nama?.toLowerCase().includes(searchLower),
      );
    }

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = filteredData.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      success: true,
      message: 'Daftar usulan menunggu persetujuan berhasil diambil',
      data: paginatedData,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Penandatangan menyetujui usulan (ubah semua detail draft → booking)
   * Validasi: positionId dari token harus cocok dengan id_position_penandatangan di request
   */
  async approvePenandatangan(requestId: string, positionId: number): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    if (Number(request.idPositionPenandatangan) !== positionId) {
      throw new BadRequestException(
        'Anda tidak berwenang menyetujui usulan ini. Hanya penandatangan yang ditunjuk yang dapat menyetujui.',
      );
    }

    const draftDetails = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId, status: 'draft' },
    });

    if (draftDetails.length === 0) {
      throw new BadRequestException('Tidak ada detail dengan status draft untuk disetujui');
    }

    for (const detail of draftDetails) {
      detail.status = 'booking';
    }
    await this.nomorRequestDetailRepository.save(draftDetails);

    return {
      success: true,
      message: `${draftDetails.length} usulan berhasil disetujui dan siap diverifikasi admin`,
      data: {
        request_id: requestId,
        approved_count: draftDetails.length,
        details: draftDetails.map((d) => ({ id: d.id, status: d.status })),
      },
    };
  }

  /**
   * Penandatangan menolak usulan (ubah semua detail draft → ditolak)
   * Validasi: positionId dari token harus cocok dengan id_position_penandatangan di request
   */
  async rejectPenandatangan(requestId: string, positionId: number): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    if (Number(request.idPositionPenandatangan) !== positionId) {
      throw new BadRequestException(
        'Anda tidak berwenang menolak usulan ini. Hanya penandatangan yang ditunjuk yang dapat menolak.',
      );
    }

    const draftDetails = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId, status: 'draft' },
    });

    if (draftDetails.length === 0) {
      throw new BadRequestException('Tidak ada detail dengan status draft untuk ditolak');
    }

    for (const detail of draftDetails) {
      detail.status = 'ditolak';
    }
    await this.nomorRequestDetailRepository.save(draftDetails);

    return {
      success: true,
      message: `${draftDetails.length} usulan berhasil ditolak`,
      data: {
        request_id: requestId,
        rejected_count: draftDetails.length,
        details: draftDetails.map((d) => ({ id: d.id, status: d.status })),
      },
    };
  }

  /**
   * Helper: Convert bulan ke Romawi
   */
  private getBulanRomawi(bulan: number): string {
    const mapping: Record<number, string> = {
      1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI',
      7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII',
    };
    return mapping[bulan] || 'I';
  }

  /**
   * Admin langsung create nomor valid (tanpa melalui booking/approve)
   * Menggabungkan proses create request + approve dalam satu step
   */
  async adminCreateNomor(dto: AdminCreateNomorDto): Promise<AdminCreateNomorResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Ambil data org_data berdasarkan tanggal
      const tglFormatted = this.formatDate(new Date(dto.tanggal));
      let positionJsonData: any[] = [];
      
      try {
        const orgData = await this.orgDataService.findOrg(tglFormatted);
        if (orgData?.position_json && Array.isArray(orgData.position_json)) {
          positionJsonData = orgData.position_json;
        }
      } catch (error) {
        // Fallback to latest org_data
        const allOrgData = await this.orgDataService.findAll();
        if (allOrgData.length > 0) {
          const latestOrgData = allOrgData.sort((a, b) => {
            const dateA = a.tgl ? new Date(a.tgl).getTime() : 0;
            const dateB = b.tgl ? new Date(b.tgl).getTime() : 0;
            return dateB - dateA;
          })[0];
          
          if (latestOrgData?.position_json) {
            positionJsonData = latestOrgData.position_json;
          }
        }
      }

      // 2. Parse position_json dan cari position_id pengirim
      const positionData = positionJsonData.find((p: any) => p.position === dto.position_id);

      if (!positionData) {
        throw new NotFoundException(
          `Position dengan ID ${dto.position_id} tidak ditemukan di org_data untuk tanggal ${tglFormatted}`
        );
      }

      // 3. Ambil data penandatangan untuk parameter counter
      // Parameter counter menggunakan data dari penandatangan, bukan pengirim
      let penandatanganData: any = null;
      if (dto.id_position_penandatangan) {
        penandatanganData = positionJsonData.find((p: any) => p.position === dto.id_position_penandatangan);
        if (!penandatanganData) {
          throw new NotFoundException(
            `Position penandatangan dengan ID ${dto.id_position_penandatangan} tidak ditemukan di org_data`
          );
        }
      }

      // Gunakan data penandatangan untuk parameter counter, fallback ke pengirim jika tidak ada
      const counterData = penandatanganData || positionData;

      // 4. Create nomor_request
      const requestId = uuidv4();
      const nomorRequest = this.nomorRequestRepository.create({
        id: requestId,
        company: counterData.company?.toString() || null,
        area: counterData.area || null,
        subArea: counterData.sub_area?.toString() || null,
        organization: counterData.organization_id?.toString() || null,
        position: dto.position_id.toString(),
        tanggal: dto.tanggal,
        jenis: dto.jenis,
        klasifikasi: dto.klasifikasi || null,
        perihal: dto.perihal,
        jumlah: dto.jumlah,
        penandatangan: dto.penandatangan || null,
        idPositionPenandatangan: dto.id_position_penandatangan || null,
      });

      await queryRunner.manager.save(nomorRequest);

      // 6. Ambil format penomoran dari tabel jenis
      const jenisData = await queryRunner.manager.findOne(JenisEntity, {
        where: { jenis: dto.jenis },
      });

      if (!jenisData || !jenisData.formatPenomoran) {
        throw new BadRequestException(
          `Format penomoran untuk jenis ${dto.jenis} tidak ditemukan`,
        );
      }

      const tahun = new Date(dto.tanggal).getFullYear();
      const isNdOrDi = dto.jenis === 'ND' || dto.jenis === 'DI';

      // 8. Ambil abbreviation dari penandatangan untuk placeholder {JABATAN}
      let penandatanganPositionAbbreviation: string | null = null;
      let penandatanganArea: string | null = null;

      if (penandatanganData) {
        penandatanganPositionAbbreviation = penandatanganData.position_abbreviation || penandatanganData.abbreviation || null;
        penandatanganArea = penandatanganData.area || null;
      }

      if (!penandatanganArea && nomorRequest.area) {
        penandatanganArea = nomorRequest.area;
      }

      // 9. Loop untuk generate setiap nomor sesuai jumlah yang diminta
      const nomorList: any[] = [];

      for (let i = 0; i < dto.jumlah; i++) {
        // Query nomor terakhir dengan locking
        let queryBuilder = queryRunner.manager
          .createQueryBuilder(NomorEntity, 'n')
          .where('n.tahun = :tahun', { tahun })
          .andWhere('n.jenis = :jenis', { jenis: dto.jenis })
          .andWhere('n.company = :company', { company: nomorRequest.company });

        if (isNdOrDi) {
          queryBuilder = queryBuilder.andWhere('n.position = :position', { position: nomorRequest.position });
        } else {
          queryBuilder = queryBuilder.andWhere('n.area = :area', { area: nomorRequest.area });
        }

        const nomorRecord = await queryBuilder
          .setLock('pessimistic_write')
          .getOne();

        // Generate nomor urut baru
        let noUrut = 1;
        if (nomorRecord && nomorRecord.nomor) {
          noUrut = nomorRecord.nomor + 1;
        }

        // Generate nomor lengkap
        const nomorBaru = await this.generateNomorFromFormat(
          jenisData.formatPenomoran,
          noUrut,
          nomorRequest,
          tahun,
          penandatanganPositionAbbreviation,
          penandatanganArea,
        );

        // Insert nomor_request_detail dengan status terpakai (langsung dari admin)
        const detailId = uuidv4();
        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: nomorBaru,
          status: 'terpakai',
        });

        await queryRunner.manager.save(detail);

        // UPSERT ke tabel nomor (update counter)
        if (nomorRecord) {
          nomorRecord.nomor = noUrut;
          nomorRecord.area = nomorRequest.area;
          nomorRecord.subArea = nomorRequest.subArea;
          nomorRecord.organization = nomorRequest.organization;
          nomorRecord.position = nomorRequest.position;
          nomorRecord.updatedAt = new Date();
          await queryRunner.manager.save(nomorRecord);
        } else {
          const nomorId = uuidv4();
          const nomor = this.nomorRepository.create({
            id: nomorId,
            company: nomorRequest.company,
            area: nomorRequest.area,
            subArea: nomorRequest.subArea,
            organization: nomorRequest.organization,
            position: nomorRequest.position,
            tahun,
            jenis: dto.jenis,
            nomor: noUrut,
          });
          await queryRunner.manager.save(nomor);
        }

        nomorList.push({
          id: detailId,
          nomor: nomorBaru,
          status: 'terpakai',
        });
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `${dto.jumlah} nomor berhasil dibuat`,
        data: {
          request_id: requestId,
          nomor_list: nomorList,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
