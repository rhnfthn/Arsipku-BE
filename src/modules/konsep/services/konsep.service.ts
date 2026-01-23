import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../naskah-referensi/entities/naskah_referensi.entity';
// REFACTOR: NdEntity dan SdiSdeEntity tidak lagi digunakan - data diambil dari naskah_sirkulasi
// import { NdEntity } from '../../nota-dinas/entities/nd.entity';
// import { SdiSdeEntity } from '../../surat-dinas-internal/entities/sdi_sde.entity';
import { DiEntity } from '../../disposisi/entities/di.entity';
import { KonsepRiwayatEntity } from '../entities/konsep-riwayat.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { StorageService } from '../../storage/services/storage.service';
import { GeneratePdfNodinService } from '../../generate_pdf/services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { QRCodeService } from '../../digsig/services/qrcode.service';
import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateKonsepDto,
  ForwardKonsepDto,
  FinalizeKonsepDto,
  RejectKonsepDto,
  CreateKonsepResponseDto,
  ForwardKonsepResponseDto,
  FinalizeKonsepResponseDto,
  RejectKonsepResponseDto,
} from '../dto/konsep';

const COMPANY_ID = 10000;
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';

interface PositionData {
  position: number;
  position_text: string;
  persnum_person: string | null;
  persnum_person_text: string | null;
  organization_id: number;
  organization_text: string;
  area: string | null;
  area_text: string | null;
  sub_area: number;
  sub_area_text: string | null;
  direct_manager: number | null;
  chief: number;
}

@Injectable()
export class KonsepService {
  constructor(
    @InjectRepository(NaskahEntity)
    private naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahReferensiEntity)
    private naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    // REFACTOR: NdEntity dan SdiSdeEntity tidak lagi digunakan
    // @InjectRepository(NdEntity)
    // private ndRepository: Repository<NdEntity>,
    // @InjectRepository(SdiSdeEntity)
    // private sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(DiEntity)
    private diRepository: Repository<DiEntity>,
    @InjectRepository(KonsepRiwayatEntity)
    private konsepRiwayatRepository: Repository<KonsepRiwayatEntity>,
    @InjectRepository(NomorEntity)
    private nomorRepository: Repository<NomorEntity>,
    @InjectRepository(NomorRequestEntity)
    private nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private jenisRepository: Repository<JenisEntity>,
    private orgDataService: OrgDataService,
    private storageService: StorageService,
    private generatePdfNodinService: GeneratePdfNodinService,
    private generatePdfSudinService: GeneratePdfSudinService,
    private qrCodeService: QRCodeService,
    private dataSource: DataSource,
  ) {}

  /**
   * CREATE KONSEP - Workflow Tracking
   * 
   * Creates 2 naskah records:
   * 1. Naskah jenis 'K' (konsep workflow) - tracks reviewer workflow
   * 2. Naskah jenis 'ND/SDI/SDE' (actual document) - the final document content
   * 
   * Both connected via sirkulasi with is_konsep=1 until finalized
   * 
   * Optional: Can be linked to a Disposisi (DI) as tindak lanjut via id_disposisi_referensi
   */
  async createKonsep(dto: CreateKonsepDto): Promise<CreateKonsepResponseDto> {
    const barisData = await this.getPositionData();
    const fromPos = this.findByPosition(barisData, dto.from_position_id);
    const toPos = this.findByPosition(barisData, dto.to_position_id);

    if (!fromPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
    }
    if (!toPos) {
      throw new NotFoundException(`Position ${dto.to_position_id} tidak ditemukan`);
    }

    // TODO: Validate hierarchy (commented out for now)
    // if (!this.validateHierarchy(barisData, dto.from_position_id, dto.to_position_id)) {
    //   throw new BadRequestException(
    //     `Position ${dto.to_position_id} bukan atasan dari position ${dto.from_position_id}`,
    //   );
    // }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tanggalHariIni = new Date();
      
      // ==========================================
      // 1. CREATE NASKAH KONSEP WORKFLOW (jenis='K')
      // ==========================================
      const naskahKonsepId = uuidv4();
      const perihalKonsep = dto.catatan 
        ? `Konsep ${dto.jenis}: ${dto.perihal || 'Tanpa Perihal'} - ${dto.catatan}`
        : `Konsep ${dto.jenis}: ${dto.perihal || 'Tanpa Perihal'}`;
      
      const naskahKonsep = this.naskahRepository.create({
        id: naskahKonsepId,
        jenis: 'K',
        nomor: `K-${Date.now()}`,
        tanggal: tanggalHariIni,
        perihal: perihalKonsep,
        sifat: 'biasa',
        status: 'final',
        id_naskah_asli: null, // Will be set after creating actual naskah
      });
      await queryRunner.manager.save(naskahKonsep);

      // ==========================================
      // 2. CREATE NASKAH ASLI (jenis='ND/SDI/SDE')
      // ==========================================
      const naskahAsliId = uuidv4();
      const naskahAsli = this.naskahRepository.create({
        id: naskahAsliId,
        jenis: dto.jenis,
        klasifikasi: dto.klasifikasi,
        klasifikasi_text: dto.klasifikasi_text,
        sifat: dto.sifat || 'biasa',
        nomor: `KONSEP-${Date.now()}`, // Temporary, will be replaced on finalize
        tanggal: dto.tgl ? new Date(dto.tgl) : tanggalHariIni,
        lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : undefined,
        perihal: dto.perihal,
        konten: dto.konten,
        tempat: dto.nama_tempat || fromPos.sub_area_text || 'Tangerang',
        status: 'final',
        id_naskah_konsep: naskahKonsepId, // Link to konsep workflow
      });
      await queryRunner.manager.save(naskahAsli);

      // ==========================================
      // 2a. CREATE REFERENSI TO DISPOSISI (if provided)
      // ==========================================
      if (dto.id_disposisi_referensi) {
        // Validate disposisi exists
        const disposisiRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_disposisi_referensi, jenis: 'DI' },
        });

        if (disposisiRef) {
          const naskahReferensi = new NaskahReferensiEntity();
          naskahReferensi.id = uuidv4();
          naskahReferensi.id_naskah = naskahKonsepId; // Konsep workflow (K) adalah child
          naskahReferensi.ref_jenis = 'DI';
          naskahReferensi.ref_nomor = disposisiRef.nomor;
          naskahReferensi.ref_tanggal = disposisiRef.tanggal;
          naskahReferensi.ref_perihal = disposisiRef.perihal;
          naskahReferensi.ref_pengirim = null; // Could get from disposisi sirkulasi if needed
          await queryRunner.manager.save(naskahReferensi);
        }
      }

      // Update naskah konsep with link to naskah asli
      naskahKonsep.id_naskah_asli = naskahAsliId;
      await queryRunner.manager.save(naskahKonsep);

      // ==========================================
      // 3. CREATE SIRKULASI FOR KONSEP WORKFLOW (K)
      // ==========================================
      // Pengirim konsep (pembuat) - is_konsep=0 untuk workflow K
      const sirkulasiKonsepPengirim = this.createSirkulasi(naskahKonsepId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(sirkulasiKonsepPengirim);

      // Penerima konsep (reviewer/atasan) - is_konsep=0 untuk workflow K
      const sirkulasiKonsepPenerima = this.createSirkulasi(naskahKonsepId, 'penerima', toPos, false);
      await queryRunner.manager.save(sirkulasiKonsepPenerima);

      // ==========================================
      // 4. CREATE SIRKULASI FOR NASKAH ASLI (ND/SDI/SDE) with is_konsep=1
      // ==========================================
      // Pengirim naskah final (gunakan pengirim_position_id jika ada, fallback ke from_position_id)
      const pengirimPosId = dto.pengirim_position_id || dto.from_position_id;
      const pengirimPos = this.findByPosition(barisData, pengirimPosId);
      if (pengirimPos) {
        const sirkulasiNaskahPengirim = this.createSirkulasi(naskahAsliId, 'pengirim', pengirimPos, true);
        await queryRunner.manager.save(sirkulasiNaskahPengirim);
      }

      // Penerima naskah final (dari penerima_position_ids)
      if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
        for (const posId of dto.penerima_position_ids) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahAsliId, 'penerima', pos, true);
          await queryRunner.manager.save(sirkulasi);
        }
      }

      // Tembusan naskah final (dari tembusan_position_ids)
      if (dto.tembusan_position_ids && dto.tembusan_position_ids.length > 0) {
        for (const posId of dto.tembusan_position_ids) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahAsliId, 'tembusan', pos, true);
          await queryRunner.manager.save(sirkulasi);
        }
      }

      // ==========================================
      // 5. SAVE TANDA TANGAN TO NASKAH (REFACTORED)
      // ==========================================
      // REFACTOR: NdEntity dan SdiSdeEntity tidak lagi digunakan
      // Semua data (kepada_yth, dari, nama_jabatan, nama_lengkap, tembusan)
      // sudah tersedia di naskah_sirkulasi.
      // Hanya tandaTangan yang perlu disimpan di tabel naskah.
      if (dto.tanda_tangan) {
        naskahAsli.tandaTangan = dto.tanda_tangan;
        await queryRunner.manager.save(naskahAsli);
      }

      // ==========================================
      // 6. HANDLE LAMPIRAN
      // ==========================================
      let jumlahLampiran = 0;
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.handleLampiranTempIds(naskahAsliId, dto.lampiran_temp_ids, dto.jenis);
        jumlahLampiran = dto.lampiran_temp_ids.length;
      } else if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahAsliId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: dto.jenis,
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
        jumlahLampiran = dto.lampiran.length;
      }

      // Update naskah dengan info lampiran
      if (jumlahLampiran > 0) {
        naskahAsli.lampiran = `${jumlahLampiran} file`;
        await queryRunner.manager.save(naskahAsli);
      }

      // ==========================================
      // 7. GENERATE PDF SNAPSHOT & SAVE RIWAYAT (aksi='create')
      // ==========================================
      // Generate PDF snapshot untuk state 'create'
      const pdfSnapshotUrl = await this.generateAndUploadPdfSnapshot(
        naskahAsli,
        dto.jenis,
        'create',
        1,
      );

      await this.saveRiwayat(
        queryRunner,
        naskahKonsepId,
        1, // urutan pertama
        dto.from_position_id,
        fromPos.position_text,
        fromPos.persnum_person_text,
        dto.to_position_id,
        toPos.position_text,
        toPos.persnum_person_text,
        'create',
        dto.catatan || null,
        fromPos.persnum_person,
        pdfSnapshotUrl,
      );

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil dibuat',
        data: {
          id_konsep: naskahKonsepId,
          id_naskah: naskahAsliId,
          jenis: dto.jenis,
          from: {
            position_id: fromPos.position,
            position_text: fromPos.position_text,
            persnum: fromPos.persnum_person,
            nama: fromPos.persnum_person_text,
            organization_id: fromPos.organization_id,
            organization_text: fromPos.organization_text,
            sub_area: fromPos.sub_area,
            sub_area_text: fromPos.sub_area_text,
            area: fromPos.area,
            area_text: fromPos.area_text,
            actor: 'pembuat',
          },
          to: {
            position_id: toPos.position,
            position_text: toPos.position_text,
            persnum: toPos.persnum_person,
            nama: toPos.persnum_person_text,
            organization_id: toPos.organization_id,
            organization_text: toPos.organization_text,
            sub_area: toPos.sub_area,
            sub_area_text: toPos.sub_area_text,
            area: toPos.area,
            area_text: toPos.area_text,
            actor: 'penerima',
          },
          status: 'final',
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private createSirkulasi(
    naskahId: string,
    type: 'pengirim' | 'penerima' | 'tembusan',
    posData: PositionData,
    isKonsep: boolean,
  ): NaskahSirkulasi {
    const sirkulasi = new NaskahSirkulasi();
    sirkulasi.id = uuidv4();
    sirkulasi.idNaskah = naskahId;
    sirkulasi.sirkuler = type;
    sirkulasi.company = String(COMPANY_ID);
    sirkulasi.area = posData.area;
    sirkulasi.areaText = posData.area_text;
    sirkulasi.subArea = String(posData.sub_area);
    sirkulasi.subAreaText = posData.sub_area_text;
    sirkulasi.organization = String(posData.organization_id);
    sirkulasi.organizationText = posData.organization_text;
    sirkulasi.position = String(posData.position);
    sirkulasi.positionText = posData.position_text;
    sirkulasi.positionStatus = 'ybs';
    sirkulasi.idSirkuler = String(posData.persnum_person || posData.position);
    sirkulasi.namaSirkuler = posData.persnum_person_text || posData.position_text;
    sirkulasi.isKonsep = isKonsep ? 1 : 0;
    return sirkulasi;
  }

  private async getPositionData(): Promise<PositionData[]> {
    const today = new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(today);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${today} tidak ditemukan`,
      );
    }
    return orgData.position_json as PositionData[];
  }

  private findByPosition(data: PositionData[], positionId: number): PositionData | null {
    return data.find(p => p.position === positionId) || null;
  }

  private validateHierarchy(data: PositionData[], fromPosId: number, toPosId: number): boolean {
    const fromPos = this.findByPosition(data, fromPosId);
    if (!fromPos || !fromPos.direct_manager) return false;
    
    let currentManager: number | null = fromPos.direct_manager;
    while (currentManager) {
      if (currentManager === toPosId) return true;
      const managerPos = this.findByPosition(data, currentManager);
      if (!managerPos) break;
      currentManager = managerPos.direct_manager;
    }
    return false;
  }

  private async handleLampiranTempIds(
    naskahId: string,
    lampiranTempIds: string[],
    jenis: 'ND' | 'SDI' | 'SDE',
  ): Promise<void> {
    for (const tempId of lampiranTempIds) {
      const lampiran = await this.naskahLampiranRepository.findOne({
        where: { id: tempId },
      });

      if (lampiran && lampiran.is_temporary === 1) {
        // Move file from temporary to final location
        const oldKey = lampiran.file_pdf; // e.g., temporary/uuid/filename.pdf
        const fileName = oldKey.split('/').pop() || 'file.pdf';
        const newKey = `${jenis.toLowerCase()}/${naskahId}/${fileName}`;

        try {
          // Copy file to new location
          await this.storageService['s3Client'].send(
            new (await import('@aws-sdk/client-s3')).CopyObjectCommand({
              Bucket: this.storageService['bucketName'],
              CopySource: `${this.storageService['bucketName']}/${oldKey}`,
              Key: newKey,
              ContentDisposition: 'inline',
            }),
          );

          // Delete old temporary file
          await this.storageService['s3Client'].send(
            new (await import('@aws-sdk/client-s3')).DeleteObjectCommand({
              Bucket: this.storageService['bucketName'],
              Key: oldKey,
            }),
          );

          // Update lampiran record
          lampiran.id_naskah = naskahId;
          lampiran.is_temporary = 0;
          lampiran.jenis = jenis;
          lampiran.file_pdf = newKey;
          await this.naskahLampiranRepository.save(lampiran);
        } catch (error) {
          console.error(`Failed to move lampiran ${tempId}:`, error);
          // Still update the record even if move fails
          lampiran.id_naskah = naskahId;
          lampiran.is_temporary = 0;
          lampiran.jenis = jenis;
          await this.naskahLampiranRepository.save(lampiran);
        }
      }
    }
  }

  // ==========================================
  // NOMOR GENERATION HELPERS
  // ==========================================

  /**
   * Convert bulan ke romawi
   */
  private getBulanRomawi(bulan: number): string {
    const romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    return romawi[bulan - 1] || '';
  }

  /**
   * Extract area code (2 digit terakhir)
   */
  private extractAreaCode(area: string | null | undefined): string {
    if (!area) return '';
    if (area.length >= 2) {
      return area.slice(-2);
    }
    return area.padStart(2, '0');
  }

  /**
   * Generate nomor surat dengan integrasi ke nomor_request dan nomor_request_detail
   * Menggunakan format dari tabel jenis dan update counter di tabel nomor
   * 
   * @param jenis - Jenis surat (ND/SDI/SDE)
   * @param pengirim - Data pengirim dari position data
   * @param klasifikasi - Kode klasifikasi arsip
   * @param perihal - Perihal surat
   * @param tanggal - Tanggal surat
   * @param queryRunner - Query runner untuk transaction
   * @returns Nomor surat yang sudah di-generate
   */
  private async generateNomorWithIntegration(
    jenis: 'ND' | 'SDI' | 'SDE',
    pengirim: PositionData,
    klasifikasi: string | null,
    perihal: string,
    tanggal: Date,
    queryRunner: any,
  ): Promise<string> {
    const tahun = tanggal.getFullYear();
    const bulan = tanggal.getMonth() + 1;

    // 1. Ambil format penomoran dari tabel jenis
    const jenisData = await queryRunner.manager.findOne(JenisEntity, {
      where: { jenis },
    });

    if (!jenisData || !jenisData.formatPenomoran) {
      throw new BadRequestException(
        `Format penomoran untuk jenis ${jenis} tidak ditemukan`,
      );
    }

    // 2. Create nomor_request
    const requestId = uuidv4();
    const nomorRequest = this.nomorRequestRepository.create({
      id: requestId,
      company: String(COMPANY_ID),
      area: pengirim.area || null,
      subArea: String(pengirim.sub_area || ''),
      organization: String(pengirim.organization_id || ''),
      position: String(pengirim.position),
      tanggal: tanggal,
      jenis: jenis,
      klasifikasi: klasifikasi || null,
      perihal: perihal,
      jumlah: 1,
      penandatangan: pengirim.persnum_person_text || null,
      idPositionPenandatangan: pengirim.position || null,
    });

    await queryRunner.manager.save(nomorRequest);

    // 3. Query nomor terakhir dengan locking
    // ND menggunakan Company + Position
    // SDI/SDE menggunakan Company + Area
    let nomorRecord: NomorEntity | null;
    
    if (jenis === 'ND') {
      nomorRecord = await queryRunner.manager
        .createQueryBuilder(NomorEntity, 'n')
        .where('n.tahun = :tahun', { tahun })
        .andWhere('n.jenis = :jenis', { jenis })
        .andWhere('n.company = :company', { company: nomorRequest.company })
        .andWhere('n.position = :position', { position: nomorRequest.position })
        .setLock('pessimistic_write')
        .getOne();
    } else {
      // SDI/SDE
      nomorRecord = await queryRunner.manager
        .createQueryBuilder(NomorEntity, 'n')
        .where('n.tahun = :tahun', { tahun })
        .andWhere('n.jenis = :jenis', { jenis })
        .andWhere('n.company = :company', { company: nomorRequest.company })
        .andWhere('n.area = :area', { area: nomorRequest.area })
        .setLock('pessimistic_write')
        .getOne();
    }

    // 4. Generate nomor urut baru
    let noUrut = 1;
    if (nomorRecord && nomorRecord.nomor) {
      noUrut = nomorRecord.nomor + 1;
    }

    // 5. Generate nomor lengkap dari format (dibaca dari tabel jenis)
    const noUrutFormatted = noUrut.toString().padStart(3, '0');
    const bulanRomawi = this.getBulanRomawi(bulan);
    
    // Get position_abbreviation from extended position data if available
    // For now use position_text abbreviation or empty
    const jabatanCode = ''; // Could be extended later
    const lokasiCode = this.extractAreaCode(pengirim.area);
    const instansi = 'LPPNPI'; // Default instansi

    // Replace semua placeholder di format dengan nilai sebenarnya
    let nomorBaru = jenisData.formatPenomoran
      .replace(/{TIPE}/g, jenis)
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, klasifikasi || '')
      .replace(/{BULAN}/g, bulanRomawi)
      .replace(/{TAHUN}/g, tahun.toString());

    // Cleanup: hapus spasi berlebih dan double slash
    nomorBaru = nomorBaru
      .replace(/\/\s+/g, '/') // Hapus spasi setelah slash
      .replace(/\s+\//g, '/') // Hapus spasi sebelum slash
      .replace(/\/\//g, '/')  // Hapus double slash
      .trim();                 // Trim spasi di awal/akhir

    // 6. Insert nomor_request_detail dengan status 'terpakai'
    const detailId = uuidv4();
    const detail = this.nomorRequestDetailRepository.create({
      id: detailId,
      idRequest: requestId,
      nomor: nomorBaru,
      fileName: null,
      fileText: null,
      status: 'terpakai',
    });

    await queryRunner.manager.save(detail);

    // 7. UPSERT ke tabel nomor (update counter)
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
        jenis,
        nomor: noUrut,
      });
      await queryRunner.manager.save(nomor);
    }

    return nomorBaru;
  }

  // ==========================================
  // PARSE FORM-DATA METHODS (untuk backward compatibility)
  // ==========================================

  async parseFormDataToCreateDto(body: any, files?: { lampiran_files?: Express.Multer.File[] }): Promise<CreateKonsepDto> {
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    const parseNumberArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((v: any) => Number(v));
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map((v: any) => Number(v)) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    return {
      jenis: body.jenis,
      from_position_id: Number(body.from_position_id),
      to_position_id: Number(body.to_position_id),
      pengirim_position_id: body.pengirim_position_id ? Number(body.pengirim_position_id) : undefined,
      id_disposisi_referensi: body.id_disposisi_referensi || undefined,
      perihal: body.perihal,
      konten: body.konten,
      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat || 'biasa',
      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,
      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      nama_lengkap: body.nama_lengkap,
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,
      penerima_position_ids: body.penerima_position_ids ? parseNumberArray(body.penerima_position_ids) : undefined,
      tembusan_position_ids: body.tembusan_position_ids ? parseNumberArray(body.tembusan_position_ids) : undefined,
      catatan: body.catatan,
      kepada_yth: body.kepada_yth,
      alamat: body.alamat,
      dari: body.dari,
      tembusan: body.tembusan,
      tgl: body.tgl,
      tanda_tangan: body.tanda_tangan,
    };
  }

  async parseFormDataToForwardDto(body: any, files?: { lampiran_files?: Express.Multer.File[] }): Promise<ForwardKonsepDto> {
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    const parseNumberArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((v: any) => Number(v));
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map((v: any) => Number(v)) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    return {
      from_position_id: Number(body.from_position_id),
      to_position_id: Number(body.to_position_id),
      perihal: body.perihal,
      konten: body.konten,
      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat,
      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,
      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      nama_lengkap: body.nama_lengkap,
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,
      penerima_position_ids: body.penerima_position_ids ? parseNumberArray(body.penerima_position_ids) : undefined,
      tembusan_position_ids: body.tembusan_position_ids ? parseNumberArray(body.tembusan_position_ids) : undefined,
      catatan: body.catatan,
      kepada_yth: body.kepada_yth,
      alamat: body.alamat,
      dari: body.dari,
      tembusan: body.tembusan,
      tanda_tangan: body.tanda_tangan,
    };
  }

  async parseFormDataToFinalizeDto(body: any, files?: { lampiran_files?: Express.Multer.File[] }): Promise<FinalizeKonsepDto> {
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    const parseNumberArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((v: any) => Number(v));
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map((v: any) => Number(v)) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    return {
      from_position_id: Number(body.from_position_id),
      penerima_position_ids: body.penerima_position_ids ? parseNumberArray(body.penerima_position_ids) : undefined,
      tembusan_position_ids: body.tembusan_position_ids ? parseNumberArray(body.tembusan_position_ids) : undefined,
      perihal: body.perihal,
      konten: body.konten,
      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat,
      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,
      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      nama_lengkap: body.nama_lengkap,
      tanda_tangan: body.tanda_tangan,
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,
      catatan: body.catatan,
      kepada_yth: body.kepada_yth,
      alamat: body.alamat,
      dari: body.dari,
      tembusan: body.tembusan,
      tanggal: body.tanggal,
    };
  }

  async parseFormDataToRejectDto(body: any): Promise<RejectKonsepDto> {
    return {
      from_position_id: Number(body.from_position_id),
      catatan: body.catatan,
      return_to_position_id: body.return_to_position_id ? Number(body.return_to_position_id) : undefined,
    };
  }

  // ==========================================
  // GET RECIPIENT (KONSEP)
  // ==========================================

  /**
   * GET /KONSEP/get-recipient/:position_id
   * Dapatkan daftar penerima konsep (atasan) untuk position_id
   * 
   * Berbeda dengan Nota Dinas:
   * - Konsep bisa dikirim ke position manapun (hierarchy validation sudah dinonaktifkan)
   * - Return sender position dan daftar ALL positions (bukan hanya ATASAN/REKAN/BAWAHAN)
   * - Untuk kemudahan UI dalam memilih penerima konsep
   * 
   * @param positionId Position ID pembuat konsep
   * @returns { sender: PositionData, recipients: PositionData[] }
   */
  async getRecipient(positionId: number): Promise<any> {
    try {
      const barisData = await this.getPositionData();

      // Find sender's position data
      const sender = this.findByPosition(barisData, positionId);

      if (!sender) {
        throw new NotFoundException(
          `Position dengan ID ${positionId} tidak ditemukan dalam data organisasi`,
        );
      }

      // For konsep, return only managerial positions (chief=1)
      // User dapat memilih atasan sebagai penerima konsepnya
      const recipients = barisData
        .filter((x) => x.position !== positionId && x.chief === 1) // Only chief (managerial)
        .sort((a, b) => {
          // Sort: prioritize same sub_area, then by position_text
          if (a.sub_area === b.sub_area) {
            return String(a.position_text).localeCompare(String(b.position_text));
          }
          return (a.sub_area || 0) - (b.sub_area || 0);
        });

      return {
        success: true,
        data: {
          sender,
          recipients,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Gagal mendapatkan daftar penerima konsep',
      );
    }
  }

  // ==========================================
  // FORWARD KONSEP
  // ==========================================

  /**
   * POST /KONSEP/forward/:id
   * Forward konsep ke posisi berikutnya
   * 
   * Flow:
   * 1. Validasi konsep dengan jenis='K' ada
   * 2. Validasi from_position_id adalah penerima saat ini
   * 3. Buat sirkulasi baru untuk konsep workflow (K) dengan penerima baru
   * 4. Update konten naskah asli jika ada perubahan
   * 
   * @param id ID naskah konsep (jenis='K')
   * @param dto ForwardKonsepDto
   * @returns ForwardKonsepResponseDto
   */
  async forwardKonsep(id: string, dto: ForwardKonsepDto): Promise<ForwardKonsepResponseDto> {
    const barisData = await this.getPositionData();

    // Find position data
    const fromPos = this.findByPosition(barisData, dto.from_position_id);
    const toPos = this.findByPosition(barisData, dto.to_position_id);

    if (!fromPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
    }
    if (!toPos) {
      throw new NotFoundException(`Position ${dto.to_position_id} tidak ditemukan`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate konsep exists and is jenis='K'
      const naskahKonsep = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // 2. Validate from_position_id is current penerima
      const currentPenerimaSirkulasi = await queryRunner.manager.findOne(NaskahSirkulasi, {
        where: { 
          idNaskah: id, 
          sirkuler: 'penerima',
          position: String(dto.from_position_id),
        },
      });

      if (!currentPenerimaSirkulasi) {
        throw new BadRequestException(
          `Position ${dto.from_position_id} bukan penerima konsep saat ini`,
        );
      }

      // 3. Create new sirkulasi for current penerima as pengirim (forwarder role)
      // Don't update existing record, create new one to maintain history
      const newSirkulasiPengirim = this.createSirkulasi(id, 'pengirim', fromPos, false);
      await queryRunner.manager.save(newSirkulasiPengirim);

      // 4. Create new sirkulasi for new penerima konsep (K)
      const newSirkulasiPenerima = this.createSirkulasi(id, 'penerima', toPos, false);
      await queryRunner.manager.save(newSirkulasiPenerima);

      // 5. Update naskah konsep perihal with catatan if provided
      if (dto.catatan) {
        naskahKonsep.perihal = `${naskahKonsep.perihal} - [Forward: ${dto.catatan}]`;
        await queryRunner.manager.save(naskahKonsep);
      }

      // 6. Get naskah asli and update if there are changes
      const naskahAsliId = naskahKonsep.id_naskah_asli;
      if (naskahAsliId) {
        const naskahAsli = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: naskahAsliId },
        });

        if (naskahAsli) {
          // Update naskah asli fields if provided
          if (dto.perihal) naskahAsli.perihal = dto.perihal;
          if (dto.konten) naskahAsli.konten = dto.konten;
          if (dto.klasifikasi) naskahAsli.klasifikasi = dto.klasifikasi;
          if (dto.klasifikasi_text) naskahAsli.klasifikasi_text = dto.klasifikasi_text;
          if (dto.sifat) naskahAsli.sifat = dto.sifat;
          await queryRunner.manager.save(naskahAsli);

          // Update ND/SDI/SDE content if exists
          const jenis = naskahAsli.jenis;
          if (jenis === 'ND') {
            await queryRunner.manager.update('nd', { idNaskah: naskahAsliId }, {
              perihal: dto.perihal || undefined,
              konten: dto.konten || undefined,
              kopLogo: dto.kop_logo || undefined,
              kopNama: dto.kop_nama || undefined,
              alamatPerusahaan: dto.alamat_perusahaan || undefined,
              namaTempat: dto.nama_tempat || undefined,
              namaJabatan: dto.nama_jabatan || undefined,
              namaLengkap: dto.nama_lengkap || undefined,
              dari: dto.dari || undefined,
              tembusan: dto.tembusan || undefined,
            });
          } else if (jenis === 'SDI' || jenis === 'SDE') {
            await queryRunner.manager.update('sdi_sde', { idNaskah: naskahAsliId }, {
              perihal: dto.perihal || undefined,
              konten: dto.konten || undefined,
              kopLogo: dto.kop_logo || undefined,
              kopNama: dto.kop_nama || undefined,
              alamatPerusahaan: dto.alamat_perusahaan || undefined,
              namaTempat: dto.nama_tempat || undefined,
              namaJabatan: dto.nama_jabatan || undefined,
              namaLengkap: dto.nama_lengkap || undefined,
              kepadaYth: dto.kepada_yth || undefined,
              alamat: dto.alamat || undefined,
              tembusan: dto.tembusan || undefined,
            });
          }

          // Handle new lampiran if provided
          if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
            await this.handleLampiranTempIds(naskahAsliId, dto.lampiran_temp_ids, jenis as 'ND' | 'SDI' | 'SDE');
          }

          // Handle penerima update if provided
          if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
            // Delete old penerima sirkulasi for naskah asli
            await queryRunner.manager.delete(NaskahSirkulasi, {
              idNaskah: naskahAsliId,
              sirkuler: 'penerima',
            });

            // Create new penerima sirkulasi
            for (const posId of dto.penerima_position_ids) {
              const pos = this.findByPosition(barisData, posId);
              if (!pos) continue;
              const sirkulasi = this.createSirkulasi(naskahAsliId, 'penerima', pos, true);
              await queryRunner.manager.save(sirkulasi);
            }
          }

          // Handle tembusan update if provided
          if (dto.tembusan_position_ids && dto.tembusan_position_ids.length > 0) {
            // Delete old tembusan sirkulasi for naskah asli
            await queryRunner.manager.delete(NaskahSirkulasi, {
              idNaskah: naskahAsliId,
              sirkuler: 'tembusan',
            });

            // Create new tembusan sirkulasi
            for (const posId of dto.tembusan_position_ids) {
              const pos = this.findByPosition(barisData, posId);
              if (!pos) continue;
              const sirkulasi = this.createSirkulasi(naskahAsliId, 'tembusan', pos, true);
              await queryRunner.manager.save(sirkulasi);
            }
          }
        }
      }

      // ==========================================
      // 7. GENERATE PDF SNAPSHOT & SAVE RIWAYAT (aksi='forward')
      // ==========================================
      // Get latest urutan
      const latestRiwayat = await queryRunner.manager.findOne(KonsepRiwayatEntity, {
        where: { idNaskahKonsep: id },
        order: { urutan: 'DESC' },
      });
      const nextUrutan = latestRiwayat ? latestRiwayat.urutan + 1 : 1;

      // Get naskah asli entity for PDF generation
      let naskahAsliForPdf: NaskahEntity | null = null;
      if (naskahAsliId) {
        naskahAsliForPdf = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: naskahAsliId },
        });
      }

      // Generate PDF snapshot untuk state 'forward'
      let pdfSnapshotUrl: string | null = null;
      if (naskahAsliForPdf) {
        pdfSnapshotUrl = await this.generateAndUploadPdfSnapshot(
          naskahAsliForPdf,
          naskahAsliForPdf.jenis as 'ND' | 'SDI' | 'SDE',
          'forward',
          nextUrutan,
        );
      }

      await this.saveRiwayat(
        queryRunner,
        id,
        nextUrutan,
        dto.from_position_id,
        fromPos.position_text,
        fromPos.persnum_person_text,
        dto.to_position_id,
        toPos.position_text,
        toPos.persnum_person_text,
        'forward',
        dto.catatan || null,
        fromPos.persnum_person,
        pdfSnapshotUrl,
      );

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil diteruskan',
        data: {
          id_konsep: id,
          id_naskah: naskahAsliId || '',
          jenis: (naskahAsliId ? (await this.naskahRepository.findOne({ where: { id: naskahAsliId } }))?.jenis : 'ND') as 'ND' | 'SDI' | 'SDE',
          from: {
            position_id: fromPos.position,
            position_text: fromPos.position_text,
            persnum: fromPos.persnum_person,
            nama: fromPos.persnum_person_text,
            organization_id: fromPos.organization_id,
            organization_text: fromPos.organization_text,
            sub_area: fromPos.sub_area,
            sub_area_text: fromPos.sub_area_text,
            area: fromPos.area,
            area_text: fromPos.area_text,
            actor: 'penerus',
          },
          to: {
            position_id: toPos.position,
            position_text: toPos.position_text,
            persnum: toPos.persnum_person,
            nama: toPos.persnum_person_text,
            organization_id: toPos.organization_id,
            organization_text: toPos.organization_text,
            sub_area: toPos.sub_area,
            sub_area_text: toPos.sub_area_text,
            area: toPos.area,
            area_text: toPos.area_text,
            actor: 'penerima',
          },
          status: 'forwarded',
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // FINALIZE KONSEP
  // ==========================================

  /**
   * POST /KONSEP/finalize/:id
   * Finalisasi konsep - generate nomor surat dan kirim ke penerima final
   * 
   * Flow:
   * 1. Validasi konsep dengan jenis='K' ada
   * 2. Validasi from_position_id adalah penerima konsep saat ini
   * 3. Generate nomor surat resmi
   * 4. Update naskah asli: status='final', nomor=generated, is_konsep=0 di sirkulasi
   * 5. Update sirkulasi penerima/tembusan jika ada perubahan
   * 
   * @param id ID naskah konsep (jenis='K')
   * @param dto FinalizeKonsepDto
   * @returns FinalizeKonsepResponseDto
   */
  async finalizeKonsep(id: string, dto: FinalizeKonsepDto): Promise<FinalizeKonsepResponseDto> {
    const barisData = await this.getPositionData();

    const fromPos = this.findByPosition(barisData, dto.from_position_id);
    if (!fromPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate konsep exists and is jenis='K'
      const naskahKonsep = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // 2. Validate from_position_id is current penerima
      const currentPenerimaSirkulasi = await queryRunner.manager.findOne(NaskahSirkulasi, {
        where: { 
          idNaskah: id, 
          sirkuler: 'penerima',
          position: String(dto.from_position_id),
        },
      });

      if (!currentPenerimaSirkulasi) {
        throw new BadRequestException(
          `Position ${dto.from_position_id} bukan penerima konsep saat ini. Tidak bisa finalize.`,
        );
      }

      // 3. Get naskah asli
      const naskahAsliId = naskahKonsep.id_naskah_asli;
      if (!naskahAsliId) {
        throw new BadRequestException('Naskah asli tidak ditemukan untuk konsep ini');
      }

      const naskahAsli = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id: naskahAsliId },
      });

      if (!naskahAsli) {
        throw new NotFoundException(`Naskah asli dengan ID ${naskahAsliId} tidak ditemukan`);
      }

      // 4. Get pengirim naskah asli (untuk generate nomor)
      const pengirimSirkulasi = await queryRunner.manager.findOne(NaskahSirkulasi, {
        where: {
          idNaskah: naskahAsliId,
          sirkuler: 'pengirim',
        },
        order: { id: 'DESC' },
      });

      // Get pengirim position data dari org_data untuk generate nomor
      let pengirimPosData = fromPos; // default ke finalizer
      if (pengirimSirkulasi && pengirimSirkulasi.position) {
        const posId = parseInt(pengirimSirkulasi.position);
        const foundPos = this.findByPosition(barisData, posId);
        if (foundPos) {
          pengirimPosData = foundPos;
        }
      }

      // 5. Generate nomor surat resmi menggunakan module penomoran
      const tanggal = dto.tanggal ? new Date(dto.tanggal) : new Date();
      const jenis = naskahAsli.jenis as 'ND' | 'SDI' | 'SDE';
      
      const nomorSurat = await this.generateNomorWithIntegration(
        jenis,
        pengirimPosData,
        naskahAsli.klasifikasi || dto.klasifikasi || null,
        naskahAsli.perihal || dto.perihal || 'Tanpa Perihal',
        tanggal,
        queryRunner,
      );

      // 6. Update naskah asli
      const finalStatus = dto.tanda_tangan ? 'final_tte' : 'final';
      naskahAsli.nomor = nomorSurat;
      naskahAsli.status = finalStatus;
      naskahAsli.tanggal = tanggal;
      if (dto.perihal) naskahAsli.perihal = dto.perihal;
      if (dto.konten) naskahAsli.konten = dto.konten;
      if (dto.klasifikasi) naskahAsli.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text) naskahAsli.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat) naskahAsli.sifat = dto.sifat;
      await queryRunner.manager.save(naskahAsli);

      // 7. Update is_konsep=0 untuk sirkulasi naskah asli (sudah final)
      await queryRunner.manager.update(NaskahSirkulasi, 
        { idNaskah: naskahAsliId },
        { isKonsep: 0 },
      );

      // 8. Update ND/SDI/SDE content
      if (jenis === 'ND') {
        await queryRunner.manager.update('nd', { idNaskah: naskahAsliId }, {
          nomor: nomorSurat,
          tanggal: tanggal,
          perihal: dto.perihal || undefined,
          konten: dto.konten || undefined,
          kopLogo: dto.kop_logo || undefined,
          kopNama: dto.kop_nama || undefined,
          alamatPerusahaan: dto.alamat_perusahaan || undefined,
          namaTempat: dto.nama_tempat || undefined,
          namaJabatan: dto.nama_jabatan || undefined,
          namaLengkap: dto.nama_lengkap || undefined,
          tandaTangan: dto.tanda_tangan || undefined,
          dari: dto.dari || undefined,
          tembusan: dto.tembusan || undefined,
        });
      } else if (jenis === 'SDI' || jenis === 'SDE') {
        await queryRunner.manager.update('sdi_sde', { idNaskah: naskahAsliId }, {
          nomor: nomorSurat,
          tanggal: tanggal,
          perihal: dto.perihal || undefined,
          konten: dto.konten || undefined,
          kopLogo: dto.kop_logo || undefined,
          kopNama: dto.kop_nama || undefined,
          alamatPerusahaan: dto.alamat_perusahaan || undefined,
          namaTempat: dto.nama_tempat || undefined,
          namaJabatan: dto.nama_jabatan || undefined,
          namaLengkap: dto.nama_lengkap || undefined,
          tandaTangan: dto.tanda_tangan || undefined,
          kepadaYth: dto.kepada_yth || undefined,
          alamat: dto.alamat || undefined,
          tembusan: dto.tembusan || undefined,
        });
      }

      // 8. Handle new penerima if provided (update sirkulasi)
      const penerimaList: Array<{ position_id: number; position_text: string; nama: string | null }> = [];
      
      if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
        // Remove old penerima sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahAsliId,
          sirkuler: 'penerima',
        });

        // Add new penerima sirkulasi
        for (const posId of dto.penerima_position_ids) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahAsliId, 'penerima', pos, false);
          await queryRunner.manager.save(sirkulasi);
          penerimaList.push({
            position_id: pos.position,
            position_text: pos.position_text,
            nama: pos.persnum_person_text,
          });
        }
      } else {
        // Get existing penerima
        const existingPenerima = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahAsliId, sirkuler: 'penerima' },
        });
        for (const p of existingPenerima) {
          penerimaList.push({
            position_id: Number(p.position),
            position_text: p.positionText || '',
            nama: p.namaSirkuler,
          });
        }
      }

      // 9. Handle tembusan if provided
      const tembusanList: Array<{ position_id: number; position_text: string; nama: string | null }> = [];
      
      if (dto.tembusan_position_ids && dto.tembusan_position_ids.length > 0) {
        // Remove old tembusan sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahAsliId,
          sirkuler: 'tembusan',
        });

        // Add new tembusan sirkulasi
        for (const posId of dto.tembusan_position_ids) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahAsliId, 'tembusan', pos, false);
          await queryRunner.manager.save(sirkulasi);
          tembusanList.push({
            position_id: pos.position,
            position_text: pos.position_text,
            nama: pos.persnum_person_text,
          });
        }
      }

      // 10. Handle new lampiran if provided
      let totalLampiran = 0;
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.handleLampiranTempIds(naskahAsliId, dto.lampiran_temp_ids, jenis as 'ND' | 'SDI' | 'SDE');
        totalLampiran = dto.lampiran_temp_ids.length;
      } else {
        // Count existing lampiran
        const existingLampiran = await queryRunner.manager.count(NaskahLampiranEntity, {
          where: { id_naskah: naskahAsliId },
        });
        totalLampiran = existingLampiran;
      }

      // Update naskah dengan info lampiran
      if (totalLampiran > 0) {
        naskahAsli.lampiran = `${totalLampiran} file`;
        await queryRunner.manager.save(naskahAsli);
      }

      // 11. Update konsep workflow status
      naskahKonsep.status = 'final';
      await queryRunner.manager.save(naskahKonsep);

      // 12. GENERATE PDF SNAPSHOT & SAVE RIWAYAT (aksi='finalize')
      // Get latest urutan
      const latestRiwayat = await queryRunner.manager.findOne(KonsepRiwayatEntity, {
        where: { idNaskahKonsep: id },
        order: { urutan: 'DESC' },
      });
      const nextUrutan = latestRiwayat ? latestRiwayat.urutan + 1 : 1;

      // Generate PDF snapshot untuk state 'finalize' (dengan nomor resmi)
      const pdfSnapshotUrl = await this.generateAndUploadPdfSnapshot(
        naskahAsli,
        jenis as 'ND' | 'SDI' | 'SDE',
        'finalize',
        nextUrutan,
      );

      await this.saveRiwayat(
        queryRunner,
        id,
        nextUrutan,
        dto.from_position_id,
        fromPos.position_text,
        fromPos.persnum_person_text,
        null, // No to_position for finalize
        null,
        null,
        'finalize',
        dto.catatan || null,
        fromPos.persnum_person,
        pdfSnapshotUrl,
      );

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil difinalisasi',
        data: {
          id_konsep: id,
          id_naskah: naskahAsliId,
          nomor_surat: nomorSurat,
          status: finalStatus as 'final' | 'final_tte',
          penerima: penerimaList,
          tembusan: tembusanList.length > 0 ? tembusanList : undefined,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // REJECT KONSEP
  // ==========================================

  /**
   * POST /KONSEP/reject/:id
   * Reject konsep dan kembalikan ke posisi sebelumnya atau pembuat awal
   * 
   * Flow:
   * 1. Validasi konsep dengan jenis='K' ada
   * 2. Validasi from_position_id adalah penerima saat ini
   * 3. Tentukan return_to_position (jika ada di body, atau ambil pembuat awal)
   * 4. Update sirkulasi: current penerima → pengirim, return_to → penerima
   * 5. Simpan riwayat dengan aksi='reject'
   * 
   * @param id ID naskah konsep (jenis='K')
   * @param dto RejectKonsepDto
   * @returns RejectKonsepResponseDto
   */
  async rejectKonsep(id: string, dto: RejectKonsepDto): Promise<RejectKonsepResponseDto> {
    const barisData = await this.getPositionData();

    // Find position data
    const fromPos = this.findByPosition(barisData, dto.from_position_id);

    if (!fromPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate konsep exists and is jenis='K'
      const naskahKonsep = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // 2. Validate from_position_id is current penerima
      const currentPenerimaSirkulasi = await queryRunner.manager.findOne(NaskahSirkulasi, {
        where: { 
          idNaskah: id, 
          sirkuler: 'penerima',
          position: String(dto.from_position_id),
        },
      });

      if (!currentPenerimaSirkulasi) {
        throw new BadRequestException(
          `Position ${dto.from_position_id} bukan penerima konsep saat ini`,
        );
      }

      // 3. Determine return_to_position
      let returnToPositionId: number;
      if (dto.return_to_position_id) {
        // Use specified return position
        returnToPositionId = dto.return_to_position_id;
      } else {
        // Get pembuat awal (urutan=1, aksi='create')
        const firstRiwayat = await queryRunner.manager.findOne(KonsepRiwayatEntity, {
          where: { idNaskahKonsep: id, urutan: 1, aksi: 'create' },
        });

        if (!firstRiwayat) {
          throw new BadRequestException('Tidak dapat menemukan pembuat konsep awal');
        }

        returnToPositionId = firstRiwayat.fromPositionId;
      }

      const returnToPos = this.findByPosition(barisData, returnToPositionId);
      if (!returnToPos) {
        throw new NotFoundException(`Position ${returnToPositionId} tidak ditemukan`);
      }

      // 4. Create new sirkulasi for current penerima as pengirim (rejector)
      // Don't update existing record, create new one to maintain history
      const newSirkulasiPengirim = this.createSirkulasi(id, 'pengirim', fromPos, false);
      await queryRunner.manager.save(newSirkulasiPengirim);

      // 5. Create new sirkulasi for return_to position
      const newSirkulasiPenerima = this.createSirkulasi(id, 'penerima', returnToPos, false);
      await queryRunner.manager.save(newSirkulasiPenerima);

      // 6. Update naskah konsep perihal with rejection note
      naskahKonsep.perihal = `${naskahKonsep.perihal} - [REJECTED: ${dto.catatan}]`;
      await queryRunner.manager.save(naskahKonsep);

      // 7. Get naskah asli ID for response
      const naskahAsliId = naskahKonsep.id_naskah_asli;

      // 8. SAVE RIWAYAT (aksi='reject') - No PDF snapshot for rejection
      const latestRiwayat = await queryRunner.manager.findOne(KonsepRiwayatEntity, {
        where: { idNaskahKonsep: id },
        order: { urutan: 'DESC' },
      });
      const nextUrutan = latestRiwayat ? latestRiwayat.urutan + 1 : 1;

      await this.saveRiwayat(
        queryRunner,
        id,
        nextUrutan,
        dto.from_position_id,
        fromPos.position_text,
        fromPos.persnum_person_text,
        returnToPositionId,
        returnToPos.position_text,
        returnToPos.persnum_person_text,
        'reject',
        dto.catatan,
        fromPos.persnum_person,
        null, // No PDF snapshot for reject
      );

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil ditolak dan dikembalikan',
        data: {
          id_konsep: id,
          id_naskah: naskahAsliId || '',
          jenis: (naskahAsliId ? (await this.naskahRepository.findOne({ where: { id: naskahAsliId } }))?.jenis : 'ND') as 'ND' | 'SDI' | 'SDE',
          from: {
            position_id: fromPos.position,
            position_text: fromPos.position_text,
            persnum: fromPos.persnum_person,
            nama: fromPos.persnum_person_text,
            organization_id: fromPos.organization_id,
            organization_text: fromPos.organization_text,
            sub_area: fromPos.sub_area,
            sub_area_text: fromPos.sub_area_text,
            area: fromPos.area,
            area_text: fromPos.area_text,
            actor: 'penolak',
          },
          return_to: {
            position_id: returnToPos.position,
            position_text: returnToPos.position_text,
            persnum: returnToPos.persnum_person,
            nama: returnToPos.persnum_person_text,
            organization_id: returnToPos.organization_id,
            organization_text: returnToPos.organization_text,
            sub_area: returnToPos.sub_area,
            sub_area_text: returnToPos.sub_area_text,
            area: returnToPos.area,
            area_text: returnToPos.area_text,
            actor: 'penerima_kembali',
          },
          status: 'rejected',
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // GET INBOX KONSEP
  // ==========================================

  /**
   * GET /KONSEP/inbox/:position_id
   * Dapatkan daftar konsep yang diterima oleh position_id
   * 
   * Menampilkan konsep yang sedang menunggu review/action dari position ini
   * 
   * @param positionId Position ID penerima
   * @returns KonsepInboxResponseDto
   */
  async getInbox(positionId: number): Promise<any> {
    try {
      // Get all konsep (jenis='K') where position is latest penerima
      // Subquery untuk mendapatkan sirkulasi penerima terbaru per konsep
      const subQuery = this.naskahSirkulasiRepository
        .createQueryBuilder('sub')
        .select('MAX(sub.id)', 'max_id')
        .where('sub.sirkuler = :sirkuler', { sirkuler: 'penerima' })
        .andWhere('sub.is_konsep = :isKonsep', { isKonsep: 0 })
        .andWhere('sub.position = :position', { position: String(positionId) })
        .groupBy('sub.id_naskah')
        .getQuery();

      const konsepList = await this.naskahSirkulasiRepository
        .createQueryBuilder('sirkulasi')
        .innerJoin(NaskahEntity, 'naskah', 'naskah.id = sirkulasi.id_naskah')
        .where('naskah.jenis = :jenis', { jenis: 'K' })
        .andWhere(`sirkulasi.id IN (${subQuery})`)
        .setParameters({ sirkuler: 'penerima', isKonsep: 0, position: String(positionId) })
        .select([
          'naskah.id as id_konsep',
          'naskah.id_naskah_asli as id_naskah',
          'naskah.perihal as perihal',
          'naskah.status as status',
          'naskah.tanggal as created_at',
          'sirkulasi.id as sirkulasi_id',
          'sirkulasi.created_at as received_at',
        ])
        .orderBy('sirkulasi.created_at', 'DESC')
        .getRawMany();

      // Enrich with riwayat and sirkulasi data
      const enrichedList = await Promise.all(
        konsepList.map(async (konsep) => {
          // Get naskah asli for jenis
          const naskahAsli = konsep.id_naskah
            ? await this.naskahRepository.findOne({ where: { id: konsep.id_naskah } })
            : null;

          // Get latest riwayat (current status)
          const latestRiwayat = await this.konsepRiwayatRepository.findOne({
            where: { idNaskahKonsep: konsep.id_konsep },
            order: { urutan: 'DESC' },
          });

          // Get pembuat awal (urutan=1)
          const firstRiwayat = await this.konsepRiwayatRepository.findOne({
            where: { idNaskahKonsep: konsep.id_konsep, urutan: 1 },
          });

          // Get pengirim (latest pengirim record for this konsep)
          const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
            where: {
              idNaskah: konsep.id_konsep,
              sirkuler: 'pengirim',
              isKonsep: 0,
            },
            order: { id: 'DESC' },
          });

          return {
            id_konsep: konsep.id_konsep,
            id_naskah: konsep.id_naskah,
            jenis: naskahAsli?.jenis || null,
            perihal: konsep.perihal,
            status: konsep.status,
            from: pengirimSirkulasi ? {
              position_id: parseInt(pengirimSirkulasi.position || '0'),
              position_text: pengirimSirkulasi.positionText,
              nama: pengirimSirkulasi.namaSirkuler,
            } : (firstRiwayat ? {
              position_id: firstRiwayat.fromPositionId,
              position_text: firstRiwayat.fromPositionText,
              nama: firstRiwayat.fromNama,
            } : null),
            last_action: latestRiwayat ? {
              urutan: latestRiwayat.urutan,
              aksi: latestRiwayat.aksi,
              from_position_id: latestRiwayat.fromPositionId,
              from_nama: latestRiwayat.fromNama,
              catatan: latestRiwayat.catatan,
              created_at: latestRiwayat.createdAt,
            } : null,
            created_at: konsep.created_at,
            received_at: konsep.received_at,
          };
        }),
      );

      return {
        success: true,
        message: 'Inbox konsep berhasil diambil',
        total: enrichedList.length,
        data: enrichedList,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Gagal mendapatkan inbox konsep',
      );
    }
  }

  // ==========================================
  // GET SENT KONSEP
  // ==========================================

  /**
   * GET /KONSEP/sent/:position_id
   * Dapatkan daftar konsep yang dikirim oleh position_id
   * 
   * Menampilkan semua konsep yang pernah dibuat atau diteruskan oleh position ini
   * 
   * @param positionId Position ID pengirim
   * @returns KonsepSentResponseDto
   */
  async getSent(positionId: number): Promise<any> {
    try {
      // Get all konsep where position was sender (from_position_id in riwayat)
      const riwayatList = await this.konsepRiwayatRepository
        .createQueryBuilder('riwayat')
        .where('riwayat.from_position_id = :positionId', { positionId })
        .select('DISTINCT riwayat.id_naskah_konsep', 'id_konsep')
        .getRawMany();

      const konsepIds = riwayatList.map((r) => r.id_konsep);

      if (konsepIds.length === 0) {
        return {
          success: true,
          message: 'Sent konsep berhasil diambil',
          total: 0,
          data: [],
        };
      }

      // Get konsep details
      const konsepList = await this.naskahRepository.find({
        where: { id: konsepIds as any, jenis: 'K' },
        order: { tanggal: 'DESC' },
      });

      // Enrich with riwayat and naskah asli data
      const enrichedList = await Promise.all(
        konsepList.map(async (konsep) => {
          // Get naskah asli for jenis
          const naskahAsli = konsep.id_naskah_asli
            ? await this.naskahRepository.findOne({ where: { id: konsep.id_naskah_asli } })
            : null;

          // Get latest riwayat (current status)
          const latestRiwayat = await this.konsepRiwayatRepository.findOne({
            where: { idNaskahKonsep: konsep.id },
            order: { urutan: 'DESC' },
          });

          // Get action by this position (latest)
          const myAction = await this.konsepRiwayatRepository.findOne({
            where: { 
              idNaskahKonsep: konsep.id,
              fromPositionId: positionId,
            },
            order: { urutan: 'DESC' },
          });

          // Get current penerima (latest penerima sirkulasi)
          const currentPenerima = await this.naskahSirkulasiRepository.findOne({
            where: {
              idNaskah: konsep.id,
              sirkuler: 'penerima',
              isKonsep: 0,
            },
            order: { id: 'DESC' },
          });

          return {
            id_konsep: konsep.id,
            id_naskah: konsep.id_naskah_asli,
            jenis: naskahAsli?.jenis || null,
            perihal: konsep.perihal,
            status: konsep.status,
            my_action: myAction ? {
              urutan: myAction.urutan,
              aksi: myAction.aksi,
              to_position_id: myAction.toPositionId,
              to_position_text: myAction.toPositionText,
              to_nama: myAction.toNama,
              catatan: myAction.catatan,
              created_at: myAction.createdAt,
            } : null,
            current_position: currentPenerima ? {
              position_id: parseInt(currentPenerima.position || '0'),
              position_text: currentPenerima.positionText,
              nama: currentPenerima.namaSirkuler,
              received_at: currentPenerima.createdAt,
            } : (latestRiwayat ? {
              position_id: latestRiwayat.toPositionId,
              position_text: latestRiwayat.toPositionText,
              nama: latestRiwayat.toNama,
              received_at: latestRiwayat.createdAt,
            } : null),
            last_action: latestRiwayat ? {
              aksi: latestRiwayat.aksi,
              urutan: latestRiwayat.urutan,
              created_at: latestRiwayat.createdAt,
            } : null,
            created_at: konsep.tanggal,
          };
        }),
      );

      return {
        success: true,
        message: 'Sent konsep berhasil diambil',
        total: enrichedList.length,
        data: enrichedList,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Gagal mendapatkan sent konsep',
      );
    }
  }

  // ==========================================
  // GET KONSEP DETAIL
  // ==========================================

  /**
   * GET /KONSEP/:id
   * Dapatkan detail lengkap konsep beserta naskah asli dan riwayat
   * 
   * @param id ID naskah konsep (jenis='K')
   * @returns Detail konsep lengkap
   */
  async getKonsepDetail(id: string): Promise<any> {
    try {
      // Get konsep (jenis='K')
      const naskahKonsep = await this.naskahRepository.findOne({
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // Get naskah asli
      let naskahAsli: NaskahEntity | null = null;
      let naskahContent: any = null;
      if (naskahKonsep.id_naskah_asli) {
        naskahAsli = await this.naskahRepository.findOne({
          where: { id: naskahKonsep.id_naskah_asli },
        });

        if (naskahAsli) {
          // REFACTOR: Get ND/SDI/SDE content dari naskah_sirkulasi, bukan dari nd/sdi_sde entity
          const pengirimAsli = await this.naskahSirkulasiRepository.findOne({
            where: { idNaskah: naskahAsli.id, sirkuler: 'pengirim' },
          });
          const penerimaAsliList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahAsli.id, sirkuler: 'penerima' },
          });
          const tembusanAsliList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahAsli.id, sirkuler: 'tembusan' },
          });
          
          // Build naskahContent from naskah + sirkulasi data
          naskahContent = {
            id: naskahAsli.id,
            idNaskah: naskahAsli.id,
            kopLogo: DEFAULT_KOP_LOGO,
            kopNama: DEFAULT_KOP_NAMA,
            alamatPerusahaan: DEFAULT_ALAMAT_PERUSAHAAN,
            nomor: naskahAsli.nomor,
            kepadaYth: penerimaAsliList.map(p => p.positionText).join('; '),
            dari: pengirimAsli?.positionText || null,
            perihal: naskahAsli.perihal,
            konten: naskahAsli.konten,
            namaTempat: naskahAsli.tempat,
            tanggal: naskahAsli.tanggal,
            namaJabatan: pengirimAsli?.positionText || null,
            tandaTangan: naskahAsli.tandaTangan || null,
            namaLengkap: pengirimAsli?.namaSirkuler || null,
            tembusan: tembusanAsliList.map(t => t.positionText).join('; ') || null,
            sifat: naskahAsli.sifat,
            lampiran: naskahAsli.lampiran,
          };
        }
      }

      // Get riwayat
      const riwayatList = await this.konsepRiwayatRepository.find({
        where: { idNaskahKonsep: id },
        order: { urutan: 'ASC' },
      });

      // Get lampiran
      const lampiranList = naskahAsli
        ? await this.naskahLampiranRepository.find({
            where: { id_naskah: naskahAsli.id },
          })
        : [];

      // Get referensi disposisi (jika ada)
      let disposisiReferensi: any = null;
      const naskahReferensi = await this.naskahReferensiRepository.findOne({
        where: { id_naskah: naskahKonsep.id, ref_jenis: 'DI' },
      });

      if (naskahReferensi && naskahReferensi.ref_nomor) {
        // Get disposisi naskah detail
        const disposisiNaskah = await this.naskahRepository.findOne({
          where: { nomor: naskahReferensi.ref_nomor, jenis: 'DI' },
        });

        if (disposisiNaskah) {
          // Get DI content
          const diContent = await this.diRepository.findOne({
            where: { idNaskah: disposisiNaskah.id },
          });

          // Get pengirim disposisi
          const pengirimDispo = await this.naskahSirkulasiRepository.findOne({
            where: {
              idNaskah: disposisiNaskah.id,
              sirkuler: 'pengirim',
            },
          });

          // Get penerima disposisi
          const penerimaDispo = await this.naskahSirkulasiRepository.find({
            where: {
              idNaskah: disposisiNaskah.id,
              sirkuler: 'penerima',
            },
          });

          // Get lampiran disposisi
          const lampiranDispo = await this.naskahLampiranRepository.find({
            where: { id_naskah: disposisiNaskah.id },
          });

          disposisiReferensi = {
            id: disposisiNaskah.id,
            jenis: disposisiNaskah.jenis,
            nomor: disposisiNaskah.nomor,
            tanggal: disposisiNaskah.tanggal,
            perihal: disposisiNaskah.perihal,
            sifat: disposisiNaskah.sifat,
            status: disposisiNaskah.status,
            
            // DI specific fields
            kop_logo: diContent?.kopLogo || null,
            kop_judul: diContent?.kopJudul || null,
            nama_jabatan: diContent?.namaJabatan || null,
            nomor_agenda: diContent?.nomorAgenda || null,
            tanggal_agenda: diContent?.tanggalAgenda || null,
            surat_dari: diContent?.suratDari || null,
            kepada_yth: diContent?.kepadaYth || null,
            klasifikasi: diContent?.klasifikasi || disposisiNaskah.klasifikasi || null,
            disposisi: diContent?.disposisi || null,
            catatan: diContent?.catatan || null,
            
            // Pengirim
            pengirim: pengirimDispo ? {
              position_id: pengirimDispo.position || '',
              position_text: pengirimDispo.positionText || '',
              organization_text: pengirimDispo.organizationText || '',
              nama: pengirimDispo.namaSirkuler || null,
            } : null,
            
            // Penerima
            penerima: penerimaDispo.map((p) => ({
              position_id: p.position || '',
              position_text: p.positionText || '',
              organization_text: p.organizationText || '',
              nama: p.namaSirkuler || null,
              status_baca: p.sendReadTime ? 'terbaca' : 'belum_dibaca',
              read_time: p.sendReadTime ? p.sendReadTime.toISOString() : null,
            })),
            
            // Lampiran
            jumlah_lampiran: lampiranDispo.length,
            lampiran_files: await Promise.all(
              lampiranDispo.map(async (l) => ({
                id: l.id,
                file_name: l.file_name || '',
                file_path: l.file_pdf || '',
                file_url: l.file_pdf
                  ? await this.storageService.getFileUrl(l.file_pdf)
                  : null,
              })),
            ),
            
            // Final PDF
            final_pdf: disposisiNaskah.final_pdf || null,
            final_pdf_url: disposisiNaskah.final_pdf
              ? await this.storageService.getFileUrl(disposisiNaskah.final_pdf)
              : null,
          };
        }
      }

      // Get current pengirim (latest pengirim sirkulasi for konsep)
      const currentPengirim = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskahKonsep.id,
          sirkuler: 'pengirim',
          isKonsep: 0,
        },
        order: { id: 'DESC' },
      });

      // Get current penerima (latest penerima sirkulasi for konsep)
      const currentPenerima = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskahKonsep.id,
          sirkuler: 'penerima',
          isKonsep: 0,
        },
        order: { id: 'DESC' },
      });

      // Get all penerima for naskah asli (final document)
      // After finalize, isKonsep is set to 0 for the final document
      const penerimaList = naskahAsli
        ? await this.naskahSirkulasiRepository.find({
            where: {
              idNaskah: naskahAsli.id,
              sirkuler: 'penerima',
            },
          })
        : [];

      // Get all tembusan for naskah asli (final document)
      const tembusanList = naskahAsli
        ? await this.naskahSirkulasiRepository.find({
            where: {
              idNaskah: naskahAsli.id,
              sirkuler: 'tembusan',
            },
          })
        : [];

      return {
        success: true,
        message: 'Detail konsep berhasil diambil',
        data: {
          konsep: {
            id: naskahKonsep.id,
            perihal: naskahKonsep.perihal,
            status: naskahKonsep.status,
            created_at: naskahKonsep.tanggal,
          },
          disposisi_referensi: disposisiReferensi, // Disposisi asal (jika konsep ini adalah tindak lanjut)
          current_workflow: {
            pengirim: currentPengirim ? {
              position_id: parseInt(currentPengirim.position || '0'),
              position_text: currentPengirim.positionText,
              nama: currentPengirim.namaSirkuler,
              sent_at: currentPengirim.createdAt,
            } : null,
            penerima: currentPenerima ? {
              position_id: parseInt(currentPenerima.position || '0'),
              position_text: currentPenerima.positionText,
              nama: currentPenerima.namaSirkuler,
              received_at: currentPenerima.createdAt,
            } : null,
          },
          naskah: naskahAsli ? {
            id: naskahAsli.id,
            jenis: naskahAsli.jenis,
            nomor: naskahAsli.nomor,
            tanggal: naskahAsli.tanggal,
            perihal: naskahAsli.perihal,
            konten: naskahAsli.konten,
            klasifikasi: naskahAsli.klasifikasi,
            klasifikasi_text: naskahAsli.klasifikasi_text,
            sifat: naskahAsli.sifat,
            status: naskahAsli.status,
            content: naskahContent,
          } : null,
          penerima: penerimaList.map((p) => ({
            position_id: parseInt(p.position || '0'),
            position_text: p.positionText,
            nama: p.namaSirkuler,
          })),
          tembusan: tembusanList.map((t) => ({
            position_id: parseInt(t.position || '0'),
            position_text: t.positionText,
            nama: t.namaSirkuler,
          })),
          riwayat: riwayatList.map((r) => ({
            urutan: r.urutan,
            from: {
              position_id: r.fromPositionId,
              position_text: r.fromPositionText,
              nama: r.fromNama,
            },
            to: r.toPositionId ? {
              position_id: r.toPositionId,
              position_text: r.toPositionText,
              nama: r.toNama,
            } : null,
            aksi: r.aksi,
            catatan: r.catatan,
            pdf_snapshot: r.pdfSnapshot,
            created_at: r.createdAt,
            created_by: r.createdBy,
          })),
          lampiran: await Promise.all(lampiranList.map(async (l) => ({
            id: l.id,
            file_name: l.file_name,
            file_pdf: l.file_pdf,
            file_url: l.file_pdf ? await this.storageService.getFileUrl(l.file_pdf) : null,
            jenis: l.jenis,
          }))),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Gagal mendapatkan detail konsep',
      );
    }
  }

  // ==========================================
  // STUB METHODS (belum diimplementasi)
  // ==========================================

  async reviewKonsep(id: string, positionId: number, dto: any): Promise<any> {
    throw new BadRequestException('reviewKonsep belum diimplementasi');
  }

  async markAsRead(id: string, positionId: number): Promise<any> {
    throw new BadRequestException('markAsRead belum diimplementasi');
  }

  // ==========================================
  // PDF GENERATION METHODS
  // ==========================================

  /**
   * Generate plain PDF tanpa merge lampiran (untuk generate-pdf endpoint)
   */
  async generatePlainPdf(
    jenis: 'ND' | 'SDI' | 'SDE',
    body: any,
  ): Promise<Buffer> {
    try {
      const pdfDto = await this.buildPdfDto(jenis, body);

      if (jenis === 'ND') {
        return await this.generatePdfNodinService.generatePdf(pdfDto);
      } else {
        // SDI/SDE use same service
        return await this.generatePdfSudinService.generatePdf(pdfDto);
      }
    } catch (error) {
      throw new BadRequestException(
        `Gagal generate PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate PDF dengan merge lampiran (untuk preview-pdf endpoint)
   */
  async generatePreviewPdf(
    jenis: 'ND' | 'SDI' | 'SDE',
    body: any,
    lampiranTempIds?: string[],
  ): Promise<Buffer> {
    try {
      // Generate plain PDF first
      let pdfBuffer = await this.generatePlainPdf(jenis, body);

      // Merge lampiran if provided
      if (lampiranTempIds && lampiranTempIds.length > 0) {
        const lampiranFiles = await this.getTemporaryLampiranFiles(lampiranTempIds);
        if (lampiranFiles.length > 0) {
          pdfBuffer = await this.mergePdfWithLampiran(pdfBuffer, lampiranFiles);
        }
      }

      return pdfBuffer;
    } catch (error) {
      throw new BadRequestException(
        `Gagal generate preview PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Build DTO for PDF generation based on jenis
   */
  private async buildPdfDto(jenis: 'ND' | 'SDI' | 'SDE', body: any): Promise<any> {
    // Encode HTML content to base64 if needed
    let htmlContent = body.htmlContent || body.konten || '';
    if (htmlContent && !htmlContent.match(/^[A-Za-z0-9+/=]+$/)) {
      // Not base64, encode it
      htmlContent = Buffer.from(htmlContent, 'utf-8').toString('base64');
    }

    // Parse arrays if needed
    const parseArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [value];
        }
      }
      return [String(value)];
    };

    const penerimaArray = parseArray(body.penerima || body.tertuju);
    const tembusanArray = parseArray(body.tembusan);

    // Generate preview QR code untuk preview PDF
    const previewQrHtml = await this.qrCodeService.generatePreviewQRCodeHtml();

    if (jenis === 'ND') {
      return {
        html: htmlContent,
        filename: `konsep-nota-dinas-${Date.now()}.pdf`,
        tertuju: penerimaArray,
        dari: body.dari || body.nama_jabatan || '',
        perihal: body.perihal || '',
        tanggal: body.tanggal || body.tgl || '',
        positionText: body.nama_jabatan || '',
        namaLengkap: body.nama_lengkap || '',
        tembusan: tembusanArray,
        tgl: body.tgl || body.tanggal,
        nama_tempat: body.nama_tempat || 'Tangerang',
        nomor: body.nomor || '',
        headerKantor: body.header_kantor,
        headerGedung: body.header_gedung,
        headerAlamat: body.header_alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
      };
    } else {
      // SDI/SDE
      return {
        html: htmlContent,
        filename: `konsep-surat-dinas-${jenis.toLowerCase()}-${Date.now()}.pdf`,
        penerima: penerimaArray,
        dari: body.dari || body.nama_jabatan || '',
        perihal: body.perihal || '',
        tanggal: body.tanggal || body.tgl || '',
        positionText: body.nama_jabatan || '',
        namaLengkap: body.nama_lengkap || '',
        nama_jabatan: body.nama_jabatan || '',
        tembusan: tembusanArray,
        nama_tempat: body.nama_tempat || 'Tangerang',
        sifat: body.sifat || 'Biasa',
        lampiran: body.lampiran_text || '-',
        nomor: body.nomor || '',
        headerKantor: body.header_kantor,
        headerGedung: body.header_gedung,
        headerAlamat: body.header_alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
      };
    }
  }

  /**
   * Get lampiran files from storage (both temporary and final)
   */
  private async getTemporaryLampiranFiles(tempIds: string[]): Promise<any[]> {
    try {
      if (!tempIds || tempIds.length === 0) {
        return [];
      }

      const tempLampiran = await this.naskahLampiranRepository.find({
        where: { id: In(tempIds) },
      });

      const files: Array<{
        id: string;
        fileName: string;
        filePath: string;
        tempFolderId: string | null;
      }> = [];

      for (const lampiran of tempLampiran) {
        files.push({
          id: lampiran.id,
          fileName: lampiran.file_name,
          filePath: lampiran.file_pdf,
          tempFolderId: lampiran.temp_folder_id,
        });
      }

      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * Merge main PDF dengan lampiran files
   */
  private async mergePdfWithLampiran(
    mainPdfBuffer: Buffer,
    lampiranFiles: any[],
  ): Promise<Buffer> {
    try {
      if (!lampiranFiles || lampiranFiles.length === 0) {
        return mainPdfBuffer;
      }

      const pdfDoc = await PDFDocument.load(mainPdfBuffer);

      for (const file of lampiranFiles) {
        try {
          if (!file.fileName.toLowerCase().endsWith('.pdf')) {
            continue;
          }

          // Download file from MinIO
          const fileBuffer = await this.storageService.getFile(file.filePath);
          const lampiranPdf = await PDFDocument.load(fileBuffer);

          // Copy all pages
          const lampiranPages = await pdfDoc.copyPages(
            lampiranPdf,
            lampiranPdf.getPageIndices(),
          );
          lampiranPages.forEach((page) => {
            pdfDoc.addPage(page);
          });
        } catch (error) {
          // Continue with next file
        }
      }

      const mergedPdfBytes = await pdfDoc.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      return mainPdfBuffer;
    }
  }

  /**
   * Convert position IDs to names
   */
  async convertPositionIdsToNames(
    positionIds: (string | number)[],
    tanggal?: string,
  ): Promise<string[]> {
    if (!positionIds || positionIds.length === 0) {
      return [];
    }

    try {
      const barisData = await this.getPositionData();
      const names: string[] = [];

      for (const posId of positionIds) {
        const numId = typeof posId === 'string' ? parseInt(posId) : posId;
        const found = this.findByPosition(barisData, numId);
        if (found) {
          names.push(found.position_text);
        } else {
          names.push(String(posId));
        }
      }

      return names;
    } catch (error) {
      return positionIds.map((id) => String(id));
    }
  }

  /**
   * GET /KONSEP/:id/riwayat
   * Dapatkan riwayat lengkap workflow konsep
   */
  async getRiwayat(id: string): Promise<any> {
    try {
      // Validate konsep exists
      const naskahKonsep = await this.naskahRepository.findOne({
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // Get all riwayat for this konsep
      const riwayatList = await this.konsepRiwayatRepository.find({
        where: { idNaskahKonsep: id },
        order: { urutan: 'ASC' },
      });

      return {
        success: true,
        message: 'Riwayat konsep berhasil diambil',
        data: {
          id_konsep: id,
          perihal: naskahKonsep.perihal,
          status: naskahKonsep.status,
          total_langkah: riwayatList.length,
          riwayat: riwayatList.map((r) => ({
            urutan: r.urutan,
            from: {
              position_id: r.fromPositionId,
              position_text: r.fromPositionText,
              nama: r.fromNama,
            },
            to: r.toPositionId ? {
              position_id: r.toPositionId,
              position_text: r.toPositionText,
              nama: r.toNama,
            } : null,
            aksi: r.aksi,
            catatan: r.catatan,
            pdf_snapshot: r.pdfSnapshot,
            created_at: r.createdAt,
            created_by: r.createdBy,
          })),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Gagal mendapatkan riwayat konsep',
      );
    }
  }

  // ==========================================
  // HELPER: GENERATE AND UPLOAD PDF SNAPSHOT
  // ==========================================

  /**
   * Generate PDF snapshot dari konten naskah saat ini dan upload ke storage
   * 
   * @param naskahAsli Naskah entity (ND/SDI/SDE)
   * @param jenis Jenis naskah (ND|SDI|SDE)
   * @param aksi Aksi workflow (create, forward, finalize, dll)
   * @param urutan Urutan riwayat
   * @returns URL file PDF di storage atau null jika gagal
   */
  private async generateAndUploadPdfSnapshot(
    naskahAsli: NaskahEntity,
    jenis: 'ND' | 'SDI' | 'SDE',
    aksi: string,
    urutan: number,
  ): Promise<string | null> {
    try {
      // 1. Prepare data untuk generate PDF
      // Convert Date to string format for PDF generation
      const tanggalDate = naskahAsli.tanggal || new Date();
      const tanggalString = tanggalDate instanceof Date 
        ? tanggalDate.toISOString().split('T')[0] 
        : String(tanggalDate);

      const pdfBody: any = {
        jenis,
        htmlContent: naskahAsli.konten || '',
        perihal: naskahAsli.perihal || '',
        tanggal: tanggalString,
        tgl: tanggalString,
        sifat: naskahAsli.sifat || 'biasa',
        nomor: naskahAsli.nomor || '',
        klasifikasi: naskahAsli.klasifikasi || '',
        nama_tempat: naskahAsli.tempat || 'Tangerang',
        lampiran: naskahAsli.lampiran || '-',
      };

      // 2. Get penerima and tembusan dari sirkulasi
      const sirkulasiPenerima = await this.naskahSirkulasiRepository.find({
        where: { idNaskah: naskahAsli.id, sirkuler: 'penerima', isKonsep: 1 },
      });
      
      const sirkulasiTembusan = await this.naskahSirkulasiRepository.find({
        where: { idNaskah: naskahAsli.id, sirkuler: 'tembusan', isKonsep: 1 },
      });

      // Build penerima and tembusan arrays
      pdfBody.penerima = sirkulasiPenerima.map(s => s.positionText || s.namaSirkuler || '');
      pdfBody.tertuju = pdfBody.penerima;
      pdfBody.tembusan = sirkulasiTembusan.map(s => s.positionText || s.namaSirkuler || '');

      // Get pengirim data
      const sirkulasiPengirim = await this.naskahSirkulasiRepository.findOne({
        where: { idNaskah: naskahAsli.id, sirkuler: 'pengirim', isKonsep: 1 },
      });

      if (sirkulasiPengirim) {
        pdfBody.nama_jabatan = sirkulasiPengirim.positionText || '';
        pdfBody.nama_lengkap = sirkulasiPengirim.namaSirkuler || '';
      }

      // 3. Generate PDF buffer
      let pdfBuffer: Buffer;
      if (jenis === 'ND') {
        pdfBuffer = await this.generatePdfNodinService.generatePdf(pdfBody);
      } else {
        pdfBuffer = await this.generatePdfSudinService.generatePdf(pdfBody);
      }

      // 4. Upload to storage
      const timestamp = Date.now();
      const fileName = `snapshot_${aksi}_${urutan}_${timestamp}.pdf`;
      const fullKey = `konsep/${naskahAsli.id}/${fileName}`;

      // Direct upload to S3 with exact key (no auto-prefixing)
      await this.storageService['s3Client'].send(
        new (await import('@aws-sdk/client-s3')).PutObjectCommand({
          Bucket: this.storageService['bucketName'],
          Key: fullKey,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
          ContentDisposition: 'inline',
        }),
      );

      // Get URL for the uploaded file
      const uploadResult = {
        key: fullKey,
        url: await this.storageService.getFileUrl(fullKey),
        bucket: this.storageService['bucketName'],
      };

      return uploadResult.url;
    } catch (error) {
      console.error('Failed to generate PDF snapshot:', error);
      // Return null instead of throwing error to avoid breaking the workflow
      return null;
    }
  }

  // ==========================================
  // HELPER: SAVE RIWAYAT
  // ==========================================

  private async saveRiwayat(
    queryRunner: any,
    idNaskahKonsep: string,
    urutan: number,
    fromPositionId: number,
    fromPositionText: string | null,
    fromNama: string | null,
    toPositionId: number | null,
    toPositionText: string | null,
    toNama: string | null,
    aksi: 'create' | 'forward' | 'approve' | 'reject' | 'revisi' | 'finalize',
    catatan: string | null,
    createdBy: string | null,
    pdfSnapshot: string | null = null,
  ): Promise<void> {
    const riwayat = this.konsepRiwayatRepository.create({
      id: uuidv4(),
      idNaskahKonsep,
      urutan,
      fromPositionId,
      fromPositionText,
      fromNama,
      toPositionId,
      toPositionText,
      toNama,
      aksi,
      catatan,
      createdBy,
      pdfSnapshot,
    });

    await queryRunner.manager.save(riwayat);
  }
}
