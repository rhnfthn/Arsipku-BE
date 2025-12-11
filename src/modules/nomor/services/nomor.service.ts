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
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
  ) {}

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
    const positionData = positionJsonData.find((p: any) => p.position === positionNumber);
    
    const persnum = positionData?.persnum_person || null;
    const nama = positionData?.persnum_person_text || null;

    return {
      success: true,
      message: 'Detail usulan nomor berhasil diambil',
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
      },
    };
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
        details: details.map((d) => ({
          id: d.id,
          nomor: d.nomor,
          status: d.status,
          file_name: d.fileName,
          file_text: d.fileText,
          created_at: d.createdAt,
        })),
      },
    };
  }

  /**
   * Admin memproses usulan dan memasukkannya ke tabel nomor_request_detail
   * dengan status = 'booking' dan nomor = NULL
   * 
   * Jika files disediakan, setiap file akan dibooking sebagai 1 detail
   * Jika files tidak disediakan, booking berdasarkan jumlah
   */
  async bookingNomorRequest(
    requestId: string,
    dto: BookingNomorRequestDto,
  ): Promise<BookingNomorRequestResponseDto> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Usulan nomor dengan ID ${requestId} tidak ditemukan`);
    }

    const details: NomorRequestDetailEntity[] = [];

    // Jika ada files, booking per file
    if (dto.files && dto.files.length > 0) {
      for (const file of dto.files) {
        const detailId = uuidv4();
        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: null,
          fileName: file.file_name || null,
          fileText: file.file_text || null,
          status: 'booking',
        });
        details.push(detail);
      }
    } else {
      // Jika tidak ada files, booking berdasarkan jumlah
      const jumlah = dto.jumlah || request.jumlah || 1;
      for (let i = 0; i < jumlah; i++) {
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

    await this.nomorRequestDetailRepository.save(details);

    return {
      success: true,
      message: `Berhasil booking ${details.length} nomor`,
      data: {
        request_id: requestId,
        details: details.map((detail) => ({
          id: detail.id,
          status: detail.status,
          file_name: detail.fileName,
          file_text: detail.fileText,
          created_at: detail.createdAt,
        })),
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

      // 3. Ambil nomor terakhir dari tabel nomor dengan locking
      const lastNomor = await queryRunner.manager
        .createQueryBuilder(NomorEntity, 'n')
        .where('n.tahun = :tahun', { tahun })
        .andWhere('n.jenis = :jenis', { jenis: request.jenis })
        .andWhere('n.position = :position', { position: request.position })
        .orderBy('n.nomor', 'DESC')
        .setLock('pessimistic_write')
        .getOne();

      // 4. Generate nomor baru
      let noUrut = 1;
      if (lastNomor && lastNomor.nomor) {
        // Extract nomor urut dari nomor terakhir (format: 001/...)
        const match = lastNomor.nomor.match(/^(\d+)/);
        if (match) {
          noUrut = parseInt(match[1], 10) + 1;
        }
      }

      const noUrutFormatted = noUrut.toString().padStart(3, '0');
      
      // Format nomor sesuai jenis (simplified version, bisa disesuaikan)
      let nomorBaru = `${noUrutFormatted}/${request.jenis}`;
      if (request.klasifikasi) {
        nomorBaru += `/${request.klasifikasi}`;
      }
      const bulan = new Date(request.tanggal!).getMonth() + 1;
      const bulanRomawi = this.getBulanRomawi(bulan);
      nomorBaru += `/${bulanRomawi}/${tahun}`;

      // 5. Update detail: status = 'terpakai', nomor = nomor baru
      detail.status = 'terpakai';
      detail.nomor = nomorBaru;
      detail.fileName = dto.file_name || null;
      detail.fileText = dto.file_text || null;
      await queryRunner.manager.save(detail);

      // 6. Insert ke tabel nomor
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
        nomor: nomorBaru,
      });
      await queryRunner.manager.save(nomor);

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
   * status = 'hangus', nomor tetap NULL
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

          // 3. Ambil nomor terakhir dari tabel nomor dengan locking
          const lastNomor = await queryRunner.manager
            .createQueryBuilder(NomorEntity, 'n')
            .where('n.tahun = :tahun', { tahun })
            .andWhere('n.jenis = :jenis', { jenis: request.jenis })
            .andWhere('n.position = :position', { position: request.position })
            .orderBy('n.nomor', 'DESC')
            .setLock('pessimistic_write')
            .getOne();

          // 4. Generate nomor baru
          let noUrut = 1;
          if (lastNomor && lastNomor.nomor) {
            // Extract nomor urut dari nomor terakhir (format: 001/...)
            const match = lastNomor.nomor.match(/^(\d+)/);
            if (match) {
              noUrut = parseInt(match[1], 10) + 1;
            }
          }

          const noUrutFormatted = noUrut.toString().padStart(3, '0');
          
          // Format nomor sesuai jenis (simplified version, bisa disesuaikan)
          let nomorBaru = `${noUrutFormatted}/${request.jenis}`;
          if (request.klasifikasi) {
            nomorBaru += `/${request.klasifikasi}`;
          }
          const bulan = new Date(request.tanggal!).getMonth() + 1;
          const bulanRomawi = this.getBulanRomawi(bulan);
          nomorBaru += `/${bulanRomawi}/${tahun}`;

          // 5. Update detail: status = 'terpakai', nomor = nomor baru
          detail.status = 'terpakai';
          detail.nomor = nomorBaru;
          detail.fileName = dto.file_name || null;
          detail.fileText = dto.file_text || null;
          await queryRunner.manager.save(detail);

          // 6. Insert ke tabel nomor
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
            nomor: nomorBaru,
          });
          await queryRunner.manager.save(nomor);

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
   * Get semua nomor
   */
  async getNomor(query: GetNomorQueryDto): Promise<GetNomorResponseDto> {
    const whereCondition: any = {};
    if (query.tahun) {
      whereCondition.tahun = query.tahun;
    }

    const nomors = await this.nomorRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      message: 'Data nomor berhasil diambil',
      data: nomors.map((nomor) => ({
        id: nomor.id,
        company: nomor.company,
        area: nomor.area,
        sub_area: nomor.subArea,
        organization: nomor.organization,
        position: nomor.position,
        tahun: nomor.tahun,
        jenis: nomor.jenis,
        nomor: nomor.nomor,
        created_at: nomor.createdAt,
        updated_at: nomor.updatedAt,
      })),
    };
  }

  /**
   * Hapus usulan nomor dan semua detailnya
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
}
