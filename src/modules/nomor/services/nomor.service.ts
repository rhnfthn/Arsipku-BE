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
   */
  async getNomorRequestByPosition(
    positionId: number,
  ): Promise<GetMyNomorRequestResponseDto> {
    const requests = await this.nomorRequestRepository.find({
      where: { position: positionId.toString() },
      order: { createdAt: 'DESC' },
    });

    const data = await Promise.all(
      requests.map(async (request) => {
        const details = await this.nomorRequestDetailRepository.find({
          where: { idRequest: request.id },
          order: { createdAt: 'ASC' },
        });

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
          created_at: request.createdAt,
          details: details.map((detail) => ({
            id: detail.id,
            nomor: detail.nomor,
            status: detail.status,
            file_name: detail.fileName,
            created_at: detail.createdAt,
          })),
        };
      }),
    );

    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data,
    };
  }

  /**
   * Admin melihat semua usulan nomor yang sudah diajukan (status != 'Belum Diajukan')
   */
  async getAdminNomorRequestSubmitted(): Promise<GetAdminNomorRequestResponseDto> {
    const requests = await this.nomorRequestRepository.find({
      order: { createdAt: 'DESC' },
    });

    // Get latest org_data to extract position details
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

    const data = await Promise.all(
      requests.map(async (request) => {
        // Ambil detail untuk menentukan status
        const details = await this.nomorRequestDetailRepository.find({
          where: { idRequest: request.id },
        });

        let status = 'Belum Diajukan';
        if (details.length > 0) {
          const hasBooking = details.some((d) => d.status === 'booking');
          const hasTerpakai = details.some((d) => d.status === 'terpakai');
          const allHangus = details.every((d) => d.status === 'hangus');

          if (hasTerpakai) {
            status = 'Disetujui';
          } else if (allHangus) {
            status = 'Ditolak';
          } else if (hasBooking) {
            status = 'Menunggu Verifikasi';
          }
        }

        // Get position data to extract persnum and nama
        const positionNumber = parseInt(request.position!, 10);
        const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
        
        const persnum = positionData?.persnum_person || null;
        const nama = positionData?.persnum_person_text || null;

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
      }),
    );

    // Filter only requests with status != 'Belum Diajukan'
    const submittedData = data.filter((item) => item.status !== 'Belum Diajukan');

    return {
      success: true,
      message: 'Data usulan nomor yang diajukan berhasil diambil',
      data: submittedData,
    };
  }

  /**
   * Count nomor request by status (for admin dashboard)
   */
  async getAdminCountNomorRequest(): Promise<any> {
    const requests = await this.nomorRequestRepository.find();

    // Count by status
    const statusCounts = {
      menunggu_verifikasi: 0,
      disetujui: 0,
      ditolak: 0,
      belum_diajukan: 0,
    };

    for (const request of requests) {
      // Ambil detail untuk menentukan status
      const details = await this.nomorRequestDetailRepository.find({
        where: { idRequest: request.id },
      });

      let status = 'belum_diajukan';
      if (details.length > 0) {
        const hasBooking = details.some((d) => d.status === 'booking');
        const hasTerpakai = details.some((d) => d.status === 'terpakai');
        const allHangus = details.every((d) => d.status === 'hangus');

        if (hasTerpakai) {
          status = 'disetujui';
        } else if (allHangus) {
          status = 'ditolak';
        } else if (hasBooking) {
          status = 'menunggu_verifikasi';
        }
      }

      // Increment counter
      switch (status) {
        case 'menunggu_verifikasi':
          statusCounts.menunggu_verifikasi++;
          break;
        case 'disetujui':
          statusCounts.disetujui++;
          break;
        case 'ditolak':
          statusCounts.ditolak++;
          break;
        case 'belum_diajukan':
          statusCounts.belum_diajukan++;
          break;
      }
    }

    const total = requests.length;

    return {
      success: true,
      message: 'Count usulan nomor berhasil diambil',
      data: {
        menunggu_verifikasi: statusCounts.menunggu_verifikasi,
        disetujui: statusCounts.disetujui,
        ditolak: statusCounts.ditolak,
        belum_diajukan: statusCounts.belum_diajukan,
        total,
      },
    };
  }

  /**
   * Admin melihat semua usulan nomor
   */
  async getAdminNomorRequest(): Promise<GetAdminNomorRequestResponseDto> {
    const requests = await this.nomorRequestRepository.find({
      order: { createdAt: 'DESC' },
    });

    // Get latest org_data to extract position details
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

    const data = await Promise.all(
      requests.map(async (request) => {
        // Ambil detail untuk menentukan status
        const details = await this.nomorRequestDetailRepository.find({
          where: { idRequest: request.id },
        });

        let status = 'Belum Diajukan';
        if (details.length > 0) {
          const hasBooking = details.some((d) => d.status === 'booking');
          const hasTerpakai = details.some((d) => d.status === 'terpakai');
          const allHangus = details.every((d) => d.status === 'hangus');

          if (hasTerpakai) {
            status = 'Disetujui';
          } else if (allHangus) {
            status = 'Ditolak';
          } else if (hasBooking) {
            status = 'Menunggu Verifikasi';
          }
        }

        // Get position data to extract persnum and nama
        const positionNumber = parseInt(request.position!, 10);
        const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
        
        const persnum = positionData?.persnum_person || null;
        const nama = positionData?.persnum_person_text || null;

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
      }),
    );

    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data,
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
      const hasTerpakai = details.some((d) => d.status === 'terpakai');
      const allHangus = details.every((d) => d.status === 'hangus');

      if (hasTerpakai) {
        status = 'Disetujui';
      } else if (allHangus) {
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
      const detailsWithUrls = await Promise.all(
        details.map(async (d) => ({
          id: d.id,
          nomor: d.nomor,
          status: d.status,
          file_name: d.fileName,
          file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
          created_at: d.createdAt,
        }))
      );
      responseData.details = detailsWithUrls;
    }

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
      const hasTerpakai = details.some((d) => d.status === 'terpakai');
      const allHangus = details.every((d) => d.status === 'hangus');

      if (hasTerpakai) {
        status = 'Disetujui';
      } else if (allHangus) {
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
    const detailsWithUrls = await Promise.all(
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

    // Jika action = 'replace', hapus detail lama dengan status booking dan file-nya
    if (action === 'replace') {
      const oldDetails = await this.nomorRequestDetailRepository.find({
        where: { idRequest: requestId, status: 'booking' },
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
        status: 'booking',
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
          status: 'booking',
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
          status: 'booking',
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

    // Delete file dari storage jika ada
    if (detail.fileText) {
      try {
        await this.storageService.deleteFile(detail.fileText);
        console.log(`Deleted file from storage on reject: ${detail.fileText}`);
      } catch (error) {
        console.log(`Failed to delete file ${detail.fileText}:`, error.message);
      }
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

        // Delete file dari storage jika ada
        if (detail.fileText) {
          try {
            await this.storageService.deleteFile(detail.fileText);
            console.log(`Deleted file from storage on bulk reject: ${detail.fileText}`);
          } catch (error) {
            console.log(`Failed to delete file ${detail.fileText}:`, error.message);
          }
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
   * Get semua nomor yang sudah jadi (dari nomor_request_detail dengan status terpakai)
   */
  async getNomor(query: GetNomorQueryDto): Promise<GetNomorResponseDto> {
    // Get all detail dengan status terpakai
    const details = await this.nomorRequestDetailRepository.find({
      where: {
        status: 'terpakai',
      },
      order: { createdAt: 'DESC' },
    });

    // Get latest org_data for position information
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

    // Map data dari detail + request
    const data = await Promise.all(
      details.map(async (detail) => {
        const request = await this.nomorRequestRepository.findOne({
          where: { id: detail.idRequest! },
        });

        if (!request) {
          return null;
        }

        // Apply filter tahun jika ada
        if (query.tahun) {
          const detailTahun = new Date(request.tanggal!).getFullYear();
          if (detailTahun !== query.tahun) {
            return null;
          }
        }

        // Get position data pengusul untuk nama_pengirim
        const positionNumber = parseInt(request.position || '0', 10);
        const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
        const namaPengirim = positionData?.persnum_person_text || null;

        // Get position data penandatangan untuk jabatan
        let jabatan = null;
        if (request.idPositionPenandatangan) {
          const penandatanganPosition = positionJsonData.find(
            (p: any) => Number(p.position) === Number(request.idPositionPenandatangan)
          );
          jabatan = penandatanganPosition?.position_text || null;
        }

        return {
          id: detail.id,
          id_request: detail.idRequest || null,
          jenis: request.jenis,
          jabatan,
          klasifikasi: request.klasifikasi,
          perihal: request.perihal,
          tanggal: request.tanggal,
          nomor: detail.nomor,
          nama_pengirim: namaPengirim,
          waktu: detail.createdAt,
        };
      }),
    );

    // Filter out null values
    const filteredData = data.filter((item) => item !== null);

    return {
      success: true,
      message: 'Data nomor berhasil diambil',
      data: filteredData,
    };
  }

  /**
   * Get nomor by id request (menampilkan semua nomor dalam satu request)
   */
  async getNomorById(idRequest: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: idRequest },
    });

    if (!request) {
      throw new Error('Nomor request not found');
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

    // Generate signed URLs untuk nomor_list
    const nomorListWithUrls = await Promise.all(
      details
        .filter((d) => d.status === 'terpakai' && d.nomor)
        .map(async (d) => ({
          id: d.id,
          nomor: d.nomor,
          status: d.status,
          file_name: d.fileName || null,
          file_text: d.fileText || null,
          file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
          created_at: d.createdAt,
        }))
    );

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
   * Tolak semua nomor dalam satu request (set semua details status = 'hangus')
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

    // Update semua details yang belum diproses menjadi hangus
    const rejectedDetails: { id: string; status: string }[] = [];
    
    for (const detail of details) {
      // Hanya set hangus jika status masih booking
      if (detail.status === 'booking') {
        // Delete file dari storage jika ada
        if (detail.fileText) {
          try {
            await this.storageService.deleteFile(detail.fileText);
            console.log(`Deleted file from storage on reject all: ${detail.fileText}`);
          } catch (error) {
            console.log(`Failed to delete file ${detail.fileText}:`, error.message);
          }
        }

        detail.status = 'hangus';
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

        // Insert nomor_request_detail dengan status terpakai
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
