import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull } from 'typeorm';
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
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';
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
    private subAreaAlamatService: SubAreaAlamatService,
    private grupPenerimaService: GrupPenerimaService,
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
      // Perihal = catatan langsung (tanpa format)
      const perihalKonsep = dto.catatan || '';
      
      const naskahKonsep = this.naskahRepository.create({
        id: naskahKonsepId,
        jenis: 'K',
        nomor: 'KONSEP-001', // Sequential nomor, first create always 001
        tanggal: tanggalHariIni,
        perihal: perihalKonsep,
        sifat: 'biasa',
        status: 'final',
        id_naskah_asli: null, // Will be set after creating actual naskah
        id_naskah_parent: null, // No parent for first create
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
        nomor: '-', // Konsep tidak perlu nomor, will be replaced on finalize
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
      // IMPORTANT: Trace disposisi ke root/asal untuk mendapatkan disposisi pertama kali
      // Skenario: A kirim DI-001 → B forward DI-002 (ref DI-001) → C buat konsep
      // Konsep C harus merujuk ke DI-001 (asal) DAN DI-002 (langsung)
      if (dto.id_disposisi_referensi) {
        // Validate disposisi exists
        const disposisiRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_disposisi_referensi, jenis: 'DI' },
        });

        if (disposisiRef) {
          // Trace to root disposisi
          const { rootId, rootNaskah, chain } = await this.traceDisposisiToRoot(
            dto.id_disposisi_referensi,
            queryRunner,
          );

          console.log(`[CreateKonsep] Disposisi chain: ${chain.join(' → ')}`);
          console.log(`[CreateKonsep] Root disposisi: ${rootId}`);

          // Simpan referensi ke disposisi LANGSUNG (yang diterima dari B)
          const naskahReferensiLangsung = new NaskahReferensiEntity();
          naskahReferensiLangsung.id = uuidv4();
          naskahReferensiLangsung.id_naskah = naskahKonsepId;
          naskahReferensiLangsung.ref_jenis = 'DI';
          naskahReferensiLangsung.ref_nomor = disposisiRef.nomor;
          naskahReferensiLangsung.ref_tanggal = disposisiRef.tanggal;
          naskahReferensiLangsung.ref_perihal = disposisiRef.perihal;
          naskahReferensiLangsung.ref_pengirim = null;
          await queryRunner.manager.save(naskahReferensiLangsung);

          // Jika ada root yang berbeda (bukan disposisi langsung), simpan juga referensi ke root
          // Root = disposisi ASAL (dari A)
          if (rootId !== dto.id_disposisi_referensi && rootNaskah) {
            const naskahReferensiRoot = new NaskahReferensiEntity();
            naskahReferensiRoot.id = uuidv4();
            naskahReferensiRoot.id_naskah = naskahKonsepId;
            naskahReferensiRoot.ref_jenis = 'DI'; // Masih DI, tapi ini root
            naskahReferensiRoot.ref_nomor = rootNaskah.nomor;
            naskahReferensiRoot.ref_tanggal = rootNaskah.tanggal;
            naskahReferensiRoot.ref_perihal = rootNaskah.perihal;
            naskahReferensiRoot.ref_pengirim = null;
            await queryRunner.manager.save(naskahReferensiRoot);

            console.log(`[CreateKonsep] Saved 2 referensi: langsung (${disposisiRef.nomor}) + root (${rootNaskah.nomor})`);
          } else {
            console.log(`[CreateKonsep] Disposisi langsung = root. Saved 1 referensi (${disposisiRef.nomor})`);
          }
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
      // Pengirim naskah final (gunakan pengirim_position_id jika ada, fallback ke to_position_id sebagai penandatangan)
      // PENTING: Pengirim naskah adalah ATASAN (to_position_id) yang akan menandatangani, bukan pembuat konsep
      const pengirimPosId = dto.pengirim_position_id || dto.to_position_id;
      const pengirimPos = this.findByPosition(barisData, pengirimPosId);
      if (pengirimPos) {
        const sirkulasiNaskahPengirim = this.createSirkulasi(naskahAsliId, 'pengirim', pengirimPos, true);
        await queryRunner.manager.save(sirkulasiNaskahPengirim);
      } else {
        // Fallback: gunakan toPos (penerima konsep) sebagai pengirim naskah final
        const sirkulasiNaskahPengirim = this.createSirkulasi(naskahAsliId, 'pengirim', toPos, true);
        await queryRunner.manager.save(sirkulasiNaskahPengirim);
      }

      // Penerima naskah final (expand individual + grup, only for ND/SDI)
      const tanggalStr = dto.tgl || new Date().toISOString().split('T')[0];
      const expandedPenerimaIds = await this.expandGrupPenerima(
        dto.penerima_position_ids,
        (dto.jenis === 'ND' || dto.jenis === 'SDI') ? dto.penerima_grup : undefined,
        tanggalStr,
        dto.from_position_id,
      );
      const penerimaGrupMap = (dto.jenis === 'ND' || dto.jenis === 'SDI') && dto.penerima_grup?.length
        ? await this.grupPenerimaService.buildPositionToGrupMap(dto.penerima_grup)
        : new Map<number, string>();

      if (expandedPenerimaIds.length > 0) {
        for (const posId of expandedPenerimaIds) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahAsliId, 'penerima', pos, true, penerimaGrupMap.get(Number(pos.position)));
          await queryRunner.manager.save(sirkulasi);
        }
      } else if (dto.kepada_yth) {
        // Fallback: Jika tidak ada penerima_position_ids/grup tapi kepada_yth ada (text input)
        const sirkulasiPenerima = new NaskahSirkulasi();
        sirkulasiPenerima.id = uuidv4();
        sirkulasiPenerima.idNaskah = naskahAsliId;
        sirkulasiPenerima.sirkuler = 'penerima';
        sirkulasiPenerima.company = String(COMPANY_ID);
        sirkulasiPenerima.positionText = dto.kepada_yth;
        sirkulasiPenerima.namaSirkuler = dto.kepada_yth;
        sirkulasiPenerima.isKonsep = 1;
        await queryRunner.manager.save(sirkulasiPenerima);
      }

      // Tembusan naskah final (expand individual + grup, only for ND/SDI)
      const expandedTembusanIds = await this.expandGrupPenerima(
        dto.tembusan_position_ids,
        (dto.jenis === 'ND' || dto.jenis === 'SDI') ? dto.tembusan_grup : undefined,
        tanggalStr,
        dto.from_position_id,
      );
      const tembusanGrupMap = (dto.jenis === 'ND' || dto.jenis === 'SDI') && dto.tembusan_grup?.length
        ? await this.grupPenerimaService.buildPositionToGrupMap(dto.tembusan_grup)
        : new Map<number, string>();

      if (expandedTembusanIds.length > 0) {
        for (const posId of expandedTembusanIds) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahAsliId, 'tembusan', pos, true, tembusanGrupMap.get(Number(pos.position)));
          await queryRunner.manager.save(sirkulasi);
        }
      } else if (dto.tembusan) {
        // Fallback: Jika tidak ada tembusan_position_ids/grup tapi tembusan text ada
        const sirkulasiTembusan = new NaskahSirkulasi();
        sirkulasiTembusan.id = uuidv4();
        sirkulasiTembusan.idNaskah = naskahAsliId;
        sirkulasiTembusan.sirkuler = 'tembusan';
        sirkulasiTembusan.company = String(COMPANY_ID);
        sirkulasiTembusan.positionText = dto.tembusan;
        sirkulasiTembusan.namaSirkuler = dto.tembusan;
        sirkulasiTembusan.isKonsep = 1;
        await queryRunner.manager.save(sirkulasiTembusan);
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
        queryRunner, // Pass queryRunner untuk akses data dalam transaksi
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
    grupPenerimaId?: string,
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
    sirkulasi.idGrupPenerima = grupPenerimaId || null;
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

  /**
   * Expand individual penerima + grup penerima into a flat, deduplicated position ID list.
   * Excludes the sender's own position to avoid self-send.
   */
  private async expandGrupPenerima(
    individualPenerima: number[] | undefined,
    grupPenerimaIds: string[] | undefined,
    tgl?: string,
    excludePositionId?: number,
  ): Promise<number[]> {
    const allPositionIds = new Set<number>();

    if (individualPenerima && individualPenerima.length > 0) {
      individualPenerima.forEach((id) => allPositionIds.add(Number(id)));
    }

    if (grupPenerimaIds && grupPenerimaIds.length > 0) {
      for (const grupId of grupPenerimaIds) {
        try {
          const grupPositions = await this.grupPenerimaService.expandGrupToPositions(grupId, tgl);
          grupPositions.forEach((pos) => allPositionIds.add(Number(pos.position)));
        } catch (error) {
          console.warn(`[Konsep:expandGrupPenerima] Failed to expand grup ${grupId}:`, error.message);
        }
      }
    }

    if (excludePositionId !== undefined) {
      allPositionIds.delete(Number(excludePositionId));
    }

    return Array.from(allPositionIds);
  }

  /**
   * Generate sequential KONSEP nomor (KONSEP-001, KONSEP-002, etc.)
   * Sequential per naskah asli (reset for each new konsep workflow)
   * 
   * @param naskahAsliId ID naskah asli (ND/SDI/SDE) - null for first create
   * @param queryRunner Query runner for transaction
   * @returns KONSEP-XXX nomor string
   */
  private async generateKonsepNomorSequential(
    naskahAsliId: string | null,
    queryRunner: any,
  ): Promise<string> {
    if (!naskahAsliId) {
      // First create - always KONSEP-001
      return 'KONSEP-001';
    }

    // Count existing naskah K for this naskah asli
    const count = await queryRunner.manager.count(NaskahEntity, {
      where: { id_naskah_asli: naskahAsliId, jenis: 'K' },
    });

    // Next sequence number (count + 1)
    const nextNum = count + 1;
    return `KONSEP-${String(nextNum).padStart(3, '0')}`;
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
   * Trace disposisi ke asal (root disposisi pertama kali)
   * Karena forward disposisi membuat naskah DI baru dengan referensi ke sebelumnya,
   * method ini akan trace sampai ke disposisi paling awal.
   * 
   * Contoh chain:
   * A kirim DI-001 → B forward sebagai DI-002 (ref ke DI-001) → C forward sebagai DI-003 (ref ke DI-002)
   * Jika input DI-003, akan return DI-001 (disposisi asal)
   * 
   * @param disposisiId - ID naskah disposisi yang mau di-trace
   * @param queryRunner - Optional query runner untuk transaction
   * @returns ID disposisi asal (root) atau null jika tidak ada referensi
   */
  private async traceDisposisiToRoot(
    disposisiId: string,
    queryRunner?: any,
  ): Promise<{ rootId: string; rootNaskah: NaskahEntity | null; chain: string[] }> {
    const manager = queryRunner ? queryRunner.manager : this.dataSource.manager;
    const visitedIds = new Set<string>();
    const chain: string[] = [disposisiId];
    let currentId = disposisiId;
    let rootNaskah: NaskahEntity | null = null;

    // Max depth untuk prevent infinite loop (safety)
    const maxDepth = 50;
    let depth = 0;

    while (depth < maxDepth) {
      // Check if already visited (circular reference protection)
      if (visitedIds.has(currentId)) {
        console.warn(`[traceDisposisiToRoot] Circular reference detected at ${currentId}`);
        break;
      }
      visitedIds.add(currentId);

      // Get current naskah
      const currentNaskah = await manager.findOne(NaskahEntity, {
        where: { id: currentId, jenis: 'DI' },
      });

      if (!currentNaskah) {
        console.warn(`[traceDisposisiToRoot] Naskah ${currentId} not found or not DI`);
        break;
      }

      rootNaskah = currentNaskah; // Update root naskah

      // Find referensi ke disposisi sebelumnya
      const referensi = await manager.findOne(NaskahReferensiEntity, {
        where: { 
          id_naskah: currentId,
          ref_jenis: 'DI',
        },
      });

      if (!referensi || !referensi.ref_nomor) {
        // Tidak ada referensi lagi, ini adalah root
        break;
      }

      // Find naskah by ref_nomor
      const previousNaskah = await manager.findOne(NaskahEntity, {
        where: { 
          nomor: referensi.ref_nomor,
          jenis: 'DI',
        },
      });

      if (!previousNaskah) {
        // Referensi nomor tidak ditemukan, stop di sini
        break;
      }

      // Continue to previous disposisi
      currentId = previousNaskah.id;
      chain.unshift(currentId); // Add to beginning of chain
      depth++;
    }

    if (depth >= maxDepth) {
      console.error(`[traceDisposisiToRoot] Max depth reached. Possible circular reference.`);
    }

    return {
      rootId: currentId,
      rootNaskah,
      chain,
    };
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
    finalPdfKey?: string,
    finalPdfFileName?: string,
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

    // 6. Insert nomor_request_detail dengan status 'terpakai_final' (langsung dari konsep)
    const detailId = uuidv4();
    const detail = this.nomorRequestDetailRepository.create({
      id: detailId,
      idRequest: requestId,
      nomor: nomorBaru,
      fileName: finalPdfFileName || null,
      fileText: finalPdfKey || null,
      status: 'terpakai_final',
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
      penerima_grup: body.penerima_grup
        ? parseStringArray(body.penerima_grup)
        : body.tertuju_grup
          ? parseStringArray(body.tertuju_grup)
          : undefined,
      tembusan_grup: body.tembusan_grup ? parseStringArray(body.tembusan_grup) : undefined,
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
      penerima_grup: body.penerima_grup
        ? parseStringArray(body.penerima_grup)
        : body.tertuju_grup
          ? parseStringArray(body.tertuju_grup)
          : undefined,
      tembusan_grup: body.tembusan_grup ? parseStringArray(body.tembusan_grup) : undefined,
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
      penerima_grup: body.penerima_grup
        ? parseStringArray(body.penerima_grup)
        : body.tertuju_grup
          ? parseStringArray(body.tertuju_grup)
          : undefined,
      tembusan_grup: body.tembusan_grup ? parseStringArray(body.tembusan_grup) : undefined,
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
      sign_option: body.sign_option,
      passphrase: body.passphrase,
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
   * REFACTORED: Setiap forward membuat NASKAH K BARU
   * Naskah K baru di-link ke parent via id_naskah_parent
   * Ini mengatasi bug inbox menumpuk (setiap K punya sirkulasi sendiri)
   * 
   * Flow:
   * 1. Validasi konsep parent (jenis='K') ada
   * 2. Validasi from_position_id adalah penerima saat ini (via konsep_riwayat terakhir)
   * 3. Buat NASKAH K BARU dengan id_naskah_parent = konsep sebelumnya
   * 4. Buat sirkulasi untuk naskah K baru
   * 5. Update konten naskah asli jika ada perubahan
   * 
   * @param id ID naskah konsep parent (jenis='K')
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
      // 1. Validate konsep parent exists and is jenis='K'
      const naskahKonsepParent = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsepParent) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // 2. Validate from_position_id is current penerima via konsep_riwayat
      // Get latest riwayat untuk naskah asli ini
      const naskahAsliId = naskahKonsepParent.id_naskah_asli;
      if (!naskahAsliId) {
        throw new BadRequestException('Naskah asli tidak ditemukan untuk konsep ini');
      }

      // Get all konsep K for this naskah asli to find latest riwayat
      const allKonsepIds = await queryRunner.manager.find(NaskahEntity, {
        where: { id_naskah_asli: naskahAsliId, jenis: 'K' },
        select: ['id'],
      });
      const konsepIds = allKonsepIds.map(k => k.id);

      // Find latest riwayat across all konsep K for this naskah asli
      const latestRiwayat = await queryRunner.manager
        .createQueryBuilder(KonsepRiwayatEntity, 'kr')
        .where('kr.id_naskah_konsep IN (:...ids)', { ids: konsepIds })
        .orderBy('kr.urutan', 'DESC')
        .getOne();

      if (!latestRiwayat) {
        throw new BadRequestException('Tidak dapat menemukan riwayat konsep');
      }

      // Validate: from_position_id harus sama dengan toPositionId dari riwayat terakhir
      if (latestRiwayat.toPositionId !== dto.from_position_id) {
        throw new BadRequestException(
          `Position ${dto.from_position_id} bukan penerima konsep saat ini. ` +
          `Penerima saat ini adalah position ${latestRiwayat.toPositionId}`,
        );
      }

      // ==========================================
      // 3. CREATE NEW NASKAH K (jenis='K')
      // ==========================================
      const newNaskahKonsepId = uuidv4();
      const perihalKonsep = dto.catatan || '';
      
      // Generate sequential nomor
      const nomorKonsep = await this.generateKonsepNomorSequential(naskahAsliId, queryRunner);

      const newNaskahKonsep = this.naskahRepository.create({
        id: newNaskahKonsepId,
        jenis: 'K',
        nomor: nomorKonsep,
        tanggal: new Date(),
        perihal: perihalKonsep,
        sifat: 'biasa',
        status: 'final',
        id_naskah_asli: naskahAsliId,
        id_naskah_parent: id, // Link to parent konsep
      });
      await queryRunner.manager.save(newNaskahKonsep);

      // ==========================================
      // 4. CREATE SIRKULASI FOR NEW NASKAH K
      // ==========================================
      // Pengirim = forwarder (from)
      const sirkulasiPengirim = this.createSirkulasi(newNaskahKonsepId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(sirkulasiPengirim);

      // Penerima = new receiver (to)
      const sirkulasiPenerima = this.createSirkulasi(newNaskahKonsepId, 'penerima', toPos, false);
      await queryRunner.manager.save(sirkulasiPenerima);

      // ==========================================
      // 5. UPDATE NASKAH ASLI IF CHANGES PROVIDED
      // ==========================================
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

        // Handle new lampiran if provided
        if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
          await this.handleLampiranTempIds(naskahAsliId, dto.lampiran_temp_ids, naskahAsli.jenis as 'ND' | 'SDI' | 'SDE');
        }

        // Handle penerima update if provided (expand individual + grup, only for ND/SDI)
        const jenisNaskah = naskahAsli.jenis as string;
        if (dto.penerima_position_ids || dto.penerima_grup) {
          const expandedPenerimaIds = await this.expandGrupPenerima(
            dto.penerima_position_ids,
            (jenisNaskah === 'ND' || jenisNaskah === 'SDI') ? dto.penerima_grup : undefined,
            undefined,
            dto.from_position_id,
          );
          const penerimaGrupMap = (jenisNaskah === 'ND' || jenisNaskah === 'SDI') && dto.penerima_grup?.length
            ? await this.grupPenerimaService.buildPositionToGrupMap(dto.penerima_grup)
            : new Map<number, string>();

          if (expandedPenerimaIds.length > 0) {
            await queryRunner.manager.delete(NaskahSirkulasi, {
              idNaskah: naskahAsliId,
              sirkuler: 'penerima',
            });
            for (const posId of expandedPenerimaIds) {
              const pos = this.findByPosition(barisData, posId);
              if (!pos) continue;
              const sirkulasi = this.createSirkulasi(naskahAsliId, 'penerima', pos, true, penerimaGrupMap.get(Number(pos.position)));
              await queryRunner.manager.save(sirkulasi);
            }
          }
        }

        // Handle tembusan update if provided (expand individual + grup, only for ND/SDI)
        if (dto.tembusan_position_ids || dto.tembusan_grup) {
          const expandedTembusanIds = await this.expandGrupPenerima(
            dto.tembusan_position_ids,
            (jenisNaskah === 'ND' || jenisNaskah === 'SDI') ? dto.tembusan_grup : undefined,
            undefined,
            dto.from_position_id,
          );
          const tembusanGrupMap = (jenisNaskah === 'ND' || jenisNaskah === 'SDI') && dto.tembusan_grup?.length
            ? await this.grupPenerimaService.buildPositionToGrupMap(dto.tembusan_grup)
            : new Map<number, string>();

          if (expandedTembusanIds.length > 0) {
            await queryRunner.manager.delete(NaskahSirkulasi, {
              idNaskah: naskahAsliId,
              sirkuler: 'tembusan',
            });
            for (const posId of expandedTembusanIds) {
              const pos = this.findByPosition(barisData, posId);
              if (!pos) continue;
              const sirkulasi = this.createSirkulasi(naskahAsliId, 'tembusan', pos, true, tembusanGrupMap.get(Number(pos.position)));
              await queryRunner.manager.save(sirkulasi);
            }
          }
        }
      }

      // ==========================================
      // 6. GENERATE PDF SNAPSHOT & SAVE RIWAYAT
      // ==========================================
      const nextUrutan = latestRiwayat.urutan + 1;

      // Generate PDF snapshot untuk state 'forward'
      let pdfSnapshotUrl: string | null = null;
      if (naskahAsli) {
        pdfSnapshotUrl = await this.generateAndUploadPdfSnapshot(
          naskahAsli,
          naskahAsli.jenis as 'ND' | 'SDI' | 'SDE',
          'forward',
          nextUrutan,
          queryRunner,
        );
      }

      // Save riwayat with NEW naskah K id
      await this.saveRiwayat(
        queryRunner,
        newNaskahKonsepId, // NEW naskah K
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
          id_konsep: newNaskahKonsepId, // Return NEW naskah K id
          id_naskah: naskahAsliId,
          jenis: (naskahAsli?.jenis || 'ND') as 'ND' | 'SDI' | 'SDE',
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
   * REFACTORED: Setiap finalize membuat NASKAH K BARU (sama seperti forward/reject)
   * - K baru akan muncul di kotak terkirim user yang finalize
   * - K baru tidak punya penerima (finalize = endpoint)
   * - Default status konsep adalah 'final' dari awal sampai akhir
   * 
   * Digital Signature Support (menggunakan sign_option):
   * - sign_option: 'digsig' | 'qr_only' | 'ttd_basah'
   * - DIGSIG (BSrE) → status = 'final_tte'
   * - QR_ONLY → status = 'final'
   * - TTD_BASAH → status = 'final' (konsep tidak support pending)
   * - Legacy: jika ada tanda_tangan → status = 'final_tte'
   * 
   * Flow:
   * 1. Validasi konsep parent jenis='K' ada
   * 2. Validasi from_position_id adalah penerima konsep saat ini (via konsep_riwayat)
   * 3. Determine status based on sign_option or tanda_tangan
   * 4. Generate nomor surat resmi
   * 5. CREATE NEW NASKAH K untuk finalize dengan status yang tepat
   * 6. Update naskah asli: nomor=generated, status sesuai sign_option
   * 7. Update status semua K workflow lainnya ke 'final'
   * 
   * @param id ID naskah konsep parent (jenis='K')
   * @param dto FinalizeKonsepDto dengan optional sign_option dan passphrase
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
      // 1. Validate konsep parent exists and is jenis='K'
      const naskahKonsepParent = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsepParent) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // 2. Get naskah asli
      const naskahAsliId = naskahKonsepParent.id_naskah_asli;
      if (!naskahAsliId) {
        throw new BadRequestException('Naskah asli tidak ditemukan untuk konsep ini');
      }

      // 3. Validate from_position_id is current penerima via konsep_riwayat
      // Get all konsep K for this naskah asli to find latest riwayat
      const allKonsepIds = await queryRunner.manager.find(NaskahEntity, {
        where: { id_naskah_asli: naskahAsliId, jenis: 'K' },
        select: ['id'],
      });
      const konsepIds = allKonsepIds.map(k => k.id);

      // Find latest riwayat across all konsep K for this naskah asli
      const latestRiwayat = await queryRunner.manager
        .createQueryBuilder(KonsepRiwayatEntity, 'kr')
        .where('kr.id_naskah_konsep IN (:...ids)', { ids: konsepIds })
        .orderBy('kr.urutan', 'DESC')
        .getOne();

      if (!latestRiwayat) {
        throw new BadRequestException('Tidak dapat menemukan riwayat konsep');
      }

      // Validate: from_position_id harus sama dengan toPositionId dari riwayat terakhir
      if (latestRiwayat.toPositionId !== dto.from_position_id) {
        throw new BadRequestException(
          `Position ${dto.from_position_id} bukan penerima konsep saat ini. ` +
          `Penerima saat ini adalah position ${latestRiwayat.toPositionId}. Tidak bisa finalize.`,
        );
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

      // 5a. Determine status based on sign_option
      let newStatus: 'final' | 'final_tte' = 'final';
      if (dto.sign_option === 'digsig') {
        newStatus = 'final_tte'; // Digital signature dengan BSrE
        console.log('[Konsep finalize] Status = final_tte (DIGSIG)');
      } else if (dto.sign_option === 'qr_only') {
        newStatus = 'final'; // QR code tanpa BSrE
        console.log('[Konsep finalize] Status = final (QR_ONLY)');
      } else if (dto.sign_option === 'ttd_basah') {
        // Konsep tidak support pending state, ttd_basah tetap final
        newStatus = 'final';
        console.log('[Konsep finalize] Status = final (TTD_BASAH)');
      } else if (dto.tanda_tangan) {
        newStatus = 'final_tte'; // Legacy: tanda_tangan field provided
        console.log('[Konsep finalize] Status = final_tte (tanda_tangan legacy)');
      } else {
        newStatus = 'final';
        console.log('[Konsep finalize] Status = final (default)');
      }

      // 6. CREATE NEW NASKAH K untuk finalize
      // Generate nomor sequential untuk K baru (KONSEP-XXX)
      const nomorKonsep = await this.generateKonsepNomorSequential(naskahAsliId, queryRunner);
      
      const newNaskahKonsepId = uuidv4();
      const newNaskahKonsep = new NaskahEntity();
      newNaskahKonsep.id = newNaskahKonsepId;
      newNaskahKonsep.jenis = 'K';
      newNaskahKonsep.nomor = nomorKonsep;
      newNaskahKonsep.perihal = dto.catatan || '';
      newNaskahKonsep.status = newStatus;
      newNaskahKonsep.tanggal = tanggal;
      newNaskahKonsep.id_naskah_asli = naskahAsliId;
      newNaskahKonsep.id_naskah_parent = id; // Link ke konsep parent
      newNaskahKonsep.signOption = dto.sign_option || null; // Store sign_option
      newNaskahKonsep.tandaTangan = dto.tanda_tangan || null; // Store tanda_tangan metadata
      await queryRunner.manager.save(newNaskahKonsep);

      // 7. CREATE SIRKULASI untuk K baru
      // Pengirim = finalizer (fromPos)
      const sirkulasiKonsepPengirim = this.createSirkulasi(newNaskahKonsepId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(sirkulasiKonsepPengirim);
      
      // Penerima = null (finalize tidak ada penerima, ini endpoint workflow)

      // 8. Update naskah asli dengan status sesuai sign_option
      naskahAsli.nomor = nomorSurat;
      naskahAsli.status = newStatus;
      naskahAsli.signOption = dto.sign_option || null; // Store sign_option
      naskahAsli.tandaTangan = dto.tanda_tangan || null; // Store tanda_tangan metadata
      naskahAsli.tanggal = tanggal;
      if (dto.perihal) naskahAsli.perihal = dto.perihal;
      if (dto.konten) naskahAsli.konten = dto.konten;
      if (dto.klasifikasi) naskahAsli.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text) naskahAsli.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat) naskahAsli.sifat = dto.sifat;

      // 9. Update is_konsep=0 untuk sirkulasi naskah asli (sudah final)
      await queryRunner.manager.update(NaskahSirkulasi, 
        { idNaskah: naskahAsliId },
        { isKonsep: 0 },
      );

      // 10. Handle new penerima if provided (expand individual + grup, only for ND/SDI)
      const penerimaList: Array<{ position_id: number; position_text: string; nama: string | null }> = [];
      const jenisNaskahFinalize = naskahAsli.jenis as string;

      if (dto.penerima_position_ids || dto.penerima_grup) {
        const expandedPenerimaIds = await this.expandGrupPenerima(
          dto.penerima_position_ids,
          (jenisNaskahFinalize === 'ND' || jenisNaskahFinalize === 'SDI') ? dto.penerima_grup : undefined,
          dto.tanggal,
          dto.from_position_id,
        );
        const penerimaGrupMap = (jenisNaskahFinalize === 'ND' || jenisNaskahFinalize === 'SDI') && dto.penerima_grup?.length
          ? await this.grupPenerimaService.buildPositionToGrupMap(dto.penerima_grup)
          : new Map<number, string>();

        if (expandedPenerimaIds.length > 0) {
          // Remove old penerima sirkulasi
          await queryRunner.manager.delete(NaskahSirkulasi, {
            idNaskah: naskahAsliId,
            sirkuler: 'penerima',
          });

          // Add new penerima sirkulasi
          for (const posId of expandedPenerimaIds) {
            const pos = this.findByPosition(barisData, posId);
            if (!pos) continue;
            const sirkulasi = this.createSirkulasi(naskahAsliId, 'penerima', pos, false, penerimaGrupMap.get(Number(pos.position)));
            await queryRunner.manager.save(sirkulasi);
            penerimaList.push({
              position_id: pos.position,
              position_text: pos.position_text,
              nama: pos.persnum_person_text,
            });
          }
        } else {
          // Fallback to existing
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

      // 9. Handle tembusan if provided (expand individual + grup, only for ND/SDI)
      const tembusanList: Array<{ position_id: number; position_text: string; nama: string | null }> = [];

      if (dto.tembusan_position_ids || dto.tembusan_grup) {
        const expandedTembusanIds = await this.expandGrupPenerima(
          dto.tembusan_position_ids,
          (jenisNaskahFinalize === 'ND' || jenisNaskahFinalize === 'SDI') ? dto.tembusan_grup : undefined,
          dto.tanggal,
          dto.from_position_id,
        );
        const tembusanGrupMap = (jenisNaskahFinalize === 'ND' || jenisNaskahFinalize === 'SDI') && dto.tembusan_grup?.length
          ? await this.grupPenerimaService.buildPositionToGrupMap(dto.tembusan_grup)
          : new Map<number, string>();

        if (expandedTembusanIds.length > 0) {
          // Remove old tembusan sirkulasi
          await queryRunner.manager.delete(NaskahSirkulasi, {
            idNaskah: naskahAsliId,
            sirkuler: 'tembusan',
          });

          // Add new tembusan sirkulasi
          for (const posId of expandedTembusanIds) {
            const pos = this.findByPosition(barisData, posId);
            if (!pos) continue;
            const sirkulasi = this.createSirkulasi(naskahAsliId, 'tembusan', pos, false, tembusanGrupMap.get(Number(pos.position)));
            await queryRunner.manager.save(sirkulasi);
            tembusanList.push({
              position_id: pos.position,
              position_text: pos.position_text,
              nama: pos.persnum_person_text,
            });
          }
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
      }

      // 11. Update ALL konsep workflow status to final (including new K)
      // For konsep K in workflow (not finalize K), use 'final' status
      // The finalize K (newNaskahKonsepId) already has correct status from earlier
      konsepIds.push(newNaskahKonsepId);
      
      // This marks all naskah K in this workflow as completed
      // They will still appear in inbox/sent for history, but status indicates completed
      for (const konsepId of konsepIds) {
        // Skip the finalize K (it already has correct status)
        if (konsepId === newNaskahKonsepId) continue;
        
        await queryRunner.manager.update(NaskahEntity, 
          { id: konsepId },
          { status: 'final' },
        );
      }

      // 12. GENERATE PDF SNAPSHOT & SAVE RIWAYAT (aksi='finalize')
      // Use latestRiwayat from earlier validation
      const nextUrutan = latestRiwayat.urutan + 1;

      // Generate PDF snapshot untuk state 'finalize' (dengan nomor resmi)
      const pdfSnapshotUrl = await this.generateAndUploadPdfSnapshot(
        naskahAsli,
        jenis as 'ND' | 'SDI' | 'SDE',
        'finalize',
        nextUrutan,
        queryRunner, // Pass queryRunner untuk akses data dalam transaksi
      );

      // Update naskah asli dengan final_pdf
      if (pdfSnapshotUrl) {
        naskahAsli.final_pdf = pdfSnapshotUrl;
      }

      // *** SAVE NASKAH ASLI - Satu kali save untuk semua perubahan (nomor, status, tanggal, lampiran, final_pdf) ***
      await queryRunner.manager.save(naskahAsli);

      // Save riwayat with NEW naskah K id (finalize K)
      await this.saveRiwayat(
        queryRunner,
        newNaskahKonsepId, // Use the NEW naskah K for finalize
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

      // Auto mark tindak_lanjut = 1 pada sirkulasi penerima konsep yang melakukan approve/finalize
      const sirkulasiPenerimaKonsep = await queryRunner.manager.findOne(NaskahSirkulasi, {
        where: {
          idNaskah: latestRiwayat.idNaskahKonsep,
          position: String(dto.from_position_id),
          sirkuler: 'penerima',
        },
      });
      if (sirkulasiPenerimaKonsep) {
        await queryRunner.manager.update(NaskahSirkulasi,
          { id: sirkulasiPenerimaKonsep.id },
          { tindakLanjut: 1 },
        );
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil difinalisasi',
        data: {
          id_konsep: newNaskahKonsepId, // Return NEW naskah K id for finalize
          id_naskah: naskahAsliId,
          nomor_surat: nomorSurat,
          status: newStatus,
          sign_option: dto.sign_option || null,
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
   * REFACTORED: Setiap reject membuat NASKAH K BARU
   * Naskah K baru di-link ke parent via id_naskah_parent
   * Ini mengatasi bug inbox menumpuk (setiap K punya sirkulasi sendiri)
   * 
   * Flow:
   * 1. Validasi konsep parent (jenis='K') ada
   * 2. Validasi from_position_id adalah penerima saat ini (via konsep_riwayat terakhir)
   * 3. Tentukan return_to_position (jika ada di body, atau ambil pembuat awal)
   * 4. Buat NASKAH K BARU dengan id_naskah_parent = konsep sebelumnya
   * 5. Buat sirkulasi untuk naskah K baru
   * 6. Simpan riwayat dengan aksi='reject'
   * 
   * @param id ID naskah konsep parent (jenis='K')
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
      // 1. Validate konsep parent exists and is jenis='K'
      const naskahKonsepParent = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsepParent) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      // 2. Validate from_position_id is current penerima via konsep_riwayat
      const naskahAsliId = naskahKonsepParent.id_naskah_asli;
      if (!naskahAsliId) {
        throw new BadRequestException('Naskah asli tidak ditemukan untuk konsep ini');
      }

      // Get all konsep K for this naskah asli to find latest riwayat
      const allKonsepIds = await queryRunner.manager.find(NaskahEntity, {
        where: { id_naskah_asli: naskahAsliId, jenis: 'K' },
        select: ['id'],
      });
      const konsepIds = allKonsepIds.map(k => k.id);

      // Find latest riwayat across all konsep K for this naskah asli
      const latestRiwayat = await queryRunner.manager
        .createQueryBuilder(KonsepRiwayatEntity, 'kr')
        .where('kr.id_naskah_konsep IN (:...ids)', { ids: konsepIds })
        .orderBy('kr.urutan', 'DESC')
        .getOne();

      if (!latestRiwayat) {
        throw new BadRequestException('Tidak dapat menemukan riwayat konsep');
      }

      // Validate: from_position_id harus sama dengan toPositionId dari riwayat terakhir
      if (latestRiwayat.toPositionId !== dto.from_position_id) {
        throw new BadRequestException(
          `Position ${dto.from_position_id} bukan penerima konsep saat ini. ` +
          `Penerima saat ini adalah position ${latestRiwayat.toPositionId}`,
        );
      }

      // 3. Determine return_to_position
      let returnToPositionId: number;
      if (dto.return_to_position_id) {
        // Use specified return position
        returnToPositionId = dto.return_to_position_id;
      } else {
        // Get pembuat awal (urutan=1, aksi='create') from first konsep
        const firstRiwayat = await queryRunner.manager
          .createQueryBuilder(KonsepRiwayatEntity, 'kr')
          .where('kr.id_naskah_konsep IN (:...ids)', { ids: konsepIds })
          .andWhere('kr.urutan = :urutan', { urutan: 1 })
          .andWhere('kr.aksi = :aksi', { aksi: 'create' })
          .getOne();

        if (!firstRiwayat) {
          throw new BadRequestException('Tidak dapat menemukan pembuat konsep awal');
        }

        returnToPositionId = firstRiwayat.fromPositionId;
      }

      const returnToPos = this.findByPosition(barisData, returnToPositionId);
      if (!returnToPos) {
        throw new NotFoundException(`Position ${returnToPositionId} tidak ditemukan`);
      }

      // ==========================================
      // 4. CREATE NEW NASKAH K (jenis='K')
      // ==========================================
      const newNaskahKonsepId = uuidv4();
      const perihalKonsep = dto.catatan || '';
      
      // Generate sequential nomor
      const nomorKonsep = await this.generateKonsepNomorSequential(naskahAsliId, queryRunner);

      const newNaskahKonsep = this.naskahRepository.create({
        id: newNaskahKonsepId,
        jenis: 'K',
        nomor: nomorKonsep,
        tanggal: new Date(),
        perihal: perihalKonsep,
        sifat: 'biasa',
        status: 'final',
        id_naskah_asli: naskahAsliId,
        id_naskah_parent: id, // Link to parent konsep
      });
      await queryRunner.manager.save(newNaskahKonsep);

      // ==========================================
      // 5. CREATE SIRKULASI FOR NEW NASKAH K
      // ==========================================
      // Pengirim = rejector (from)
      const sirkulasiPengirim = this.createSirkulasi(newNaskahKonsepId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(sirkulasiPengirim);

      // Penerima = return_to position
      const sirkulasiPenerima = this.createSirkulasi(newNaskahKonsepId, 'penerima', returnToPos, false);
      await queryRunner.manager.save(sirkulasiPenerima);

      // ==========================================
      // 6. SAVE RIWAYAT (aksi='reject')
      // ==========================================
      const nextUrutan = latestRiwayat.urutan + 1;

      await this.saveRiwayat(
        queryRunner,
        newNaskahKonsepId, // NEW naskah K
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

      // Auto mark tindak_lanjut = 1 pada sirkulasi penerima konsep yang melakukan reject
      const sirkulasiPenerimaKonsep = await queryRunner.manager.findOne(NaskahSirkulasi, {
        where: {
          idNaskah: latestRiwayat.idNaskahKonsep,
          position: String(dto.from_position_id),
          sirkuler: 'penerima',
        },
      });
      if (sirkulasiPenerimaKonsep) {
        await queryRunner.manager.update(NaskahSirkulasi,
          { id: sirkulasiPenerimaKonsep.id },
          { tindakLanjut: 1 },
        );
      }

      await queryRunner.commitTransaction();

      // Get naskah asli for response jenis
      const naskahAsli = await this.naskahRepository.findOne({ where: { id: naskahAsliId } });

      return {
        success: true,
        message: 'Konsep berhasil ditolak dan dikembalikan',
        data: {
          id_konsep: newNaskahKonsepId, // Return NEW naskah K id
          id_naskah: naskahAsliId,
          jenis: (naskahAsli?.jenis || 'ND') as 'ND' | 'SDI' | 'SDE',
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
   * Dapatkan detail lengkap konsep beserta flow disposisi dan konsep
   * 
   * SIMPLIFIED RESPONSE:
   * Response langsung menampilkan flow dari disposisi sampai konsep
   * URUTAN ARRAY: ASC by date (oldest first at [0], newest last at [end])
   * URUTAN TAMPILAN: Dari bawah ke atas (flow[0] tampil di bawah, flow[last] tampil di atas)
   * 
   * Flow format:
   * 1. Disposisi chain (jika ada) - dari A ke B ke C
   * 2. Konsep workflow - dari create → forward → finalize
   * 
   * Contoh: A dispo B → B dispo C → C konsep B → B forward konsep A
   * Flow array: [dispo_1, dispo_2, create, forward, finalize]
   * Display: dispo_1 (bawah) → dispo_2 → create → forward → finalize (atas)
   * 
   * @param id ID naskah konsep (jenis='K')
   * @returns Detail konsep dengan flow lengkap
   */
  async getKonsepDetail(id: string, userPosition: string): Promise<any> {
    // Jenis label map
    const JENIS_LABELS: Record<string, string> = {
      DI: 'Disposisi',
      ND: 'Nota Dinas',
      SDI: 'Surat Dinas Internal',
      SDE: 'Surat Dinas Eksternal',
      KA: 'Kajian',
      K: 'Konsep',
    };

    try {
      // 1. Get konsep (jenis='K')
      const naskahKonsep = await this.naskahRepository.findOne({
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      await this.assertUserHasAccessToKonsepWorkflow(naskahKonsep, userPosition);

      // 2. Get all naskah K with same id_naskah_asli (multi-forward chain)
      let konsepIds: string[] = [naskahKonsep.id];
      if (naskahKonsep.id_naskah_asli) {
        const allKonsepK = await this.naskahRepository.find({
          where: { id_naskah_asli: naskahKonsep.id_naskah_asli, jenis: 'K' },
          select: ['id'],
        });
        konsepIds = allKonsepK.map(k => k.id);
      }

      // 3. Get all riwayat ordered by urutan ASC
      let riwayatList: KonsepRiwayatEntity[] = [];
      if (konsepIds.length > 0) {
        riwayatList = await this.konsepRiwayatRepository
          .createQueryBuilder('kr')
          .where('kr.id_naskah_konsep IN (:...ids)', { ids: konsepIds })
          .orderBy('kr.urutan', 'ASC')
          .getMany();
      }

      // 4. Find the first K naskah (parent = null) for disposisi referensi
      let firstNaskahKId = naskahKonsep.id;
      if (naskahKonsep.id_naskah_asli) {
        const firstNaskahK = await this.naskahRepository.findOne({
          where: {
            id_naskah_asli: naskahKonsep.id_naskah_asli,
            jenis: 'K',
            id_naskah_parent: IsNull(),
          },
        });
        if (firstNaskahK) {
          firstNaskahKId = firstNaskahK.id;
        }
      }

      // 5. Get all disposisi referensi for this konsep chain
      const allDisposisiReferensi = await this.naskahReferensiRepository.find({
        where: { id_naskah: firstNaskahKId, ref_jenis: 'DI' },
        order: { ref_tanggal: 'ASC' },
      });

      const flow: any[] = [];

      // ============================================================
      // PHASE 1: Build disposisi chain nodes (level = index in chain)
      // ============================================================
      for (let i = 0; i < allDisposisiReferensi.length; i++) {
        const ref = allDisposisiReferensi[i];
        if (!ref.ref_nomor) continue;

        const disposisiNaskah = await this.naskahRepository.findOne({
          where: { nomor: ref.ref_nomor, jenis: 'DI' },
        });
        if (!disposisiNaskah) continue;

        // Get DI content
        const diContent = await this.diRepository.findOne({
          where: { idNaskah: disposisiNaskah.id },
        });

        // Get sirkulasi
        const pengirimDI = await this.naskahSirkulasiRepository.findOne({
          where: { idNaskah: disposisiNaskah.id, sirkuler: 'pengirim' },
        });
        const penerimaDI = await this.naskahSirkulasiRepository.find({
          where: { idNaskah: disposisiNaskah.id, sirkuler: 'penerima' },
          order: { createdAt: 'ASC' },
        });
        const tembusanDI = await this.naskahSirkulasiRepository.find({
          where: { idNaskah: disposisiNaskah.id, sirkuler: 'tembusan' },
          order: { createdAt: 'ASC' },
        });
        const penerimaGrupInfoDI = await this.grupPenerimaService.getGrupInfoForResponse(
          [...new Set(penerimaDI.filter(p => p.idGrupPenerima).map(p => p.idGrupPenerima!))],
        );
        const tembusanGrupInfoDI = await this.grupPenerimaService.getGrupInfoForResponse(
          [...new Set(tembusanDI.filter(t => t.idGrupPenerima).map(t => t.idGrupPenerima!))],
        );

        // Get lampiran
        const lampiranDI = await this.naskahLampiranRepository.find({
          where: { id_naskah: disposisiNaskah.id },
        });

        // Get referensi
        const referensiDI = await this.naskahReferensiRepository.findOne({
          where: { id_naskah: disposisiNaskah.id },
        });

        const finalPdfUrl = disposisiNaskah.final_pdf
          ? await this.storageService.getFileUrl(disposisiNaskah.final_pdf)
          : null;

        const lampiranFiles = await Promise.all(
          lampiranDI.map(async (l) => ({
            id: l.id,
            file_name: l.file_name || '',
            file_path: l.file_pdf || '',
            file_url: l.file_pdf ? await this.storageService.getFileUrl(l.file_pdf) : null,
          })),
        );

        flow.push({
          id: disposisiNaskah.id,
          jenis: 'DI',
          jenis_label: JENIS_LABELS['DI'],
          nomor: disposisiNaskah.nomor,
          tanggal: disposisiNaskah.tanggal,
          perihal: disposisiNaskah.perihal,
          konten: disposisiNaskah.konten,
          sifat: disposisiNaskah.sifat,
          klasifikasi: disposisiNaskah.klasifikasi,
          klasifikasi_text: disposisiNaskah.klasifikasi_text,
          status: disposisiNaskah.status,
          lampiran: disposisiNaskah.lampiran,

          pengirim: pengirimDI ? {
            position_id: pengirimDI.position || '',
            position_text: pengirimDI.positionText || '',
            organization_text: pengirimDI.organizationText || '',
            nama: pengirimDI.namaSirkuler || null,
          } : null,

          penerima: penerimaDI.map(p => ({
            position_id: p.position || '',
            position_text: p.positionText || '',
            organization_text: p.organizationText || '',
            nama: p.namaSirkuler || null,
            status_baca: p.sendReadTime ? 'terbaca' : 'belum_dibaca',
            read_time: p.sendReadTime ? p.sendReadTime.toISOString() : null,
          })),

          tembusan: tembusanDI.map(t => ({
            position_id: t.position || '',
            position_text: t.positionText || '',
            organization_text: t.organizationText || '',
            nama: t.namaSirkuler || null,
          })),
          penerima_grup: penerimaGrupInfoDI,
          tembusan_grup: tembusanGrupInfoDI,

          lampiran_files: lampiranFiles,
          jumlah_lampiran: lampiranDI.length,

          final_pdf: disposisiNaskah.final_pdf,
          final_pdf_url: finalPdfUrl,

          referensi: referensiDI ? {
            ref_jenis: referensiDI.ref_jenis,
            ref_pengirim: referensiDI.ref_pengirim,
            ref_tanggal: referensiDI.ref_tanggal,
            ref_nomor: referensiDI.ref_nomor,
            ref_perihal: referensiDI.ref_perihal,
          } : null,

          detail: {
            aksi: 'disposisi',
            catatan: diContent?.catatan || null,
          },

          level: i, // DI chain depth: root=0, forward=1, dst
          created_at: pengirimDI?.createdAt || null,
          updated_at: pengirimDI?.updatedAt || null,
        });
      }

      // ============================================================
      // PHASE 2: Build konsep riwayat nodes
      // All konsep riwayat items are at level = disposisi chain length
      // ============================================================
      const konsepLevel = allDisposisiReferensi.length;

      // Get naskah asli for finalize penerima/tembusan lookup
      let naskahAsli: NaskahEntity | null = null;
      let pengirimAsli: NaskahSirkulasi | null = null;
      let penerimaAsliList: NaskahSirkulasi[] = [];
      let tembusanAsliList: NaskahSirkulasi[] = [];

      if (naskahKonsep.id_naskah_asli) {
        naskahAsli = await this.naskahRepository.findOne({
          where: { id: naskahKonsep.id_naskah_asli },
        });
        if (naskahAsli) {
          pengirimAsli = await this.naskahSirkulasiRepository.findOne({
            where: { idNaskah: naskahAsli.id, sirkuler: 'pengirim' },
          });
          penerimaAsliList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahAsli.id, sirkuler: 'penerima' },
          });
          tembusanAsliList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahAsli.id, sirkuler: 'tembusan' },
          });
        }
      }

      // Pre-compute grup info (same for all riwayat nodes)
      const penerimaGrupIds = [...new Set(penerimaAsliList.filter(p => p.idGrupPenerima).map(p => p.idGrupPenerima!))];
      const tembusanGrupIds = [...new Set(tembusanAsliList.filter(t => t.idGrupPenerima).map(t => t.idGrupPenerima!))];
      const penerimaGrupInfo = await this.grupPenerimaService.getGrupInfoForResponse(penerimaGrupIds);
      const tembusanGrupInfo = await this.grupPenerimaService.getGrupInfoForResponse(tembusanGrupIds);

      for (const riwayat of riwayatList) {
        // Get the K-naskah this riwayat belongs to (for perihal/sifat/klasifikasi)
        const riwayatNaskahK = await this.naskahRepository.findOne({
          where: { id: riwayat.idNaskahKonsep },
        });
        const naskahRef = riwayatNaskahK || naskahKonsep;

        // pdf_snapshot URL (replaces naskah asli content per requirement)
        const pdfSnapshotUrl = riwayat.pdfSnapshot
          ? await this.storageService.getFileUrl(riwayat.pdfSnapshot)
          : null;

        // Build penerima / tembusan
        let penerimaNode: any[] = [];
        let tembusanNode: any[] = [];

        if (riwayat.aksi === 'finalize' && naskahAsli) {
          // For finalize: use actual recipients from naskah asli (already pre-fetched)
          penerimaNode = penerimaAsliList.map(p => ({
            position_id: p.position || '',
            position_text: p.positionText || '',
            organization_text: p.organizationText || '',
            nama: p.namaSirkuler || null,
            status_baca: p.sendReadTime ? 'terbaca' : 'belum_dibaca',
            read_time: p.sendReadTime ? p.sendReadTime.toISOString() : null,
          }));
          tembusanNode = tembusanAsliList.map(t => ({
            position_id: t.position || '',
            position_text: t.positionText || '',
            organization_text: t.organizationText || '',
            nama: t.namaSirkuler || null,
          }));
        } else if (riwayat.toPositionId) {
          penerimaNode = [{
            position_id: String(riwayat.toPositionId),
            position_text: riwayat.toPositionText || '',
            organization_text: '',
            nama: riwayat.toNama || null,
          }];
        }

        // naskah_asli sirkulasi (same for all K nodes in this workflow)
        const naskahAsliSirkulasi = naskahAsli ? {
          pengirim: pengirimAsli ? {
            position_id: pengirimAsli.position || '',
            position_text: pengirimAsli.positionText || '',
            organization_text: pengirimAsli.organizationText || '',
            nama: pengirimAsli.namaSirkuler || null,
          } : null,
          penerima: penerimaAsliList.map(p => ({
            position_id: p.position || '',
            position_text: p.positionText || '',
            organization_text: p.organizationText || '',
            nama: p.namaSirkuler || null,
            status_baca: p.sendReadTime ? 'terbaca' : 'belum_dibaca',
            read_time: p.sendReadTime ? p.sendReadTime.toISOString() : null,
          })),
          tembusan: tembusanAsliList.map(t => ({
            position_id: t.position || '',
            position_text: t.positionText || '',
            organization_text: t.organizationText || '',
            nama: t.namaSirkuler || null,
          })),
          penerima_grup: penerimaGrupInfo,
          tembusan_grup: tembusanGrupInfo,
        } : null;

        flow.push({
          id: naskahRef.id,
          jenis: 'K',
          jenis_label: JENIS_LABELS['K'],
          nomor: naskahRef.nomor,
          tanggal: riwayat.createdAt,
          perihal: naskahAsli?.perihal ?? naskahRef.perihal,
          konten: naskahAsli?.konten ?? null,
          sifat: naskahAsli?.sifat ?? naskahRef.sifat,
          klasifikasi: naskahAsli?.klasifikasi ?? naskahRef.klasifikasi,
          klasifikasi_text: naskahAsli?.klasifikasi_text ?? naskahRef.klasifikasi_text,
          status: naskahRef.status,
          lampiran: naskahAsli?.lampiran ?? null,

          pengirim: {
            position_id: String(riwayat.fromPositionId),
            position_text: riwayat.fromPositionText || '',
            organization_text: '',
            nama: riwayat.fromNama || null,
          },

          penerima: penerimaNode,
          tembusan: tembusanNode,
          penerima_grup: penerimaGrupInfo,
          tembusan_grup: tembusanGrupInfo,

          lampiran_files: [], // Naskah asli tidak ditampilkan
          jumlah_lampiran: 0,

          final_pdf: riwayat.pdfSnapshot,
          final_pdf_url: pdfSnapshotUrl, // Hanya pdf_snapshot, bukan naskah asli

          referensi: null,

          detail: {
            aksi: riwayat.aksi,
            catatan: riwayat.catatan,
            naskah_pengirim: naskahAsliSirkulasi?.pengirim || null,
            naskah_penerima: naskahAsliSirkulasi?.penerima || [],
            naskah_tembusan: naskahAsliSirkulasi?.tembusan || [],
            penerima_grup: naskahAsliSirkulasi?.penerima_grup || [],
            tembusan_grup: naskahAsliSirkulasi?.tembusan_grup || [],
          },

          level: konsepLevel, // Selalu di atas disposisi chain
          created_at: riwayat.createdAt,
          updated_at: null,
        });
      }

      // 8. Sort by level DESC, then tanggal DESC (sama seperti getDetailWithChain)
      flow.sort((a, b) => {
        if (a.level !== b.level) {
          return b.level - a.level; // Higher level first
        }
        return new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime();
      });

      return {
        success: true,
        message: 'Detail konsep berhasil diambil',
        data: flow,
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
  // GET KONSEP INFO (TANPA FLOW)
  // ==========================================

  /**
   * GET /KONSEP/:id/info
   * Dapatkan detail konsep dan naskah TANPA flow
   * Endpoint simplified untuk view basic info saja
   * 
   * @param id ID naskah konsep (jenis='K')
   * @returns Detail konsep dan naskah (tanpa flow)
   */
  async getKonsepInfo(id: string, userPosition: string): Promise<any> {
    try {
      // Get konsep (jenis='K')
      const naskahKonsep = await this.naskahRepository.findOne({
        where: { id, jenis: 'K' },
      });

      if (!naskahKonsep) {
        throw new NotFoundException(`Konsep dengan ID ${id} tidak ditemukan`);
      }

      await this.assertUserHasAccessToKonsepWorkflow(naskahKonsep, userPosition);

      // Get naskah asli
      let naskahAsli: NaskahEntity | null = null;
      let naskahContent: any = null;
      let pengirimAsli: NaskahSirkulasi | null = null;
      let penerimaAsliList: NaskahSirkulasi[] = [];
      let tembusanAsliList: NaskahSirkulasi[] = [];
      
      if (naskahKonsep.id_naskah_asli) {
        naskahAsli = await this.naskahRepository.findOne({
          where: { id: naskahKonsep.id_naskah_asli },
        });

        if (naskahAsli) {
          // Get sirkulasi data
          pengirimAsli = await this.naskahSirkulasiRepository.findOne({
            where: { idNaskah: naskahAsli.id, sirkuler: 'pengirim' },
          });
          penerimaAsliList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahAsli.id, sirkuler: 'penerima' },
          });
          tembusanAsliList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahAsli.id, sirkuler: 'tembusan' },
          });
          
          // Build naskahContent
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

      // Get lampiran
      const lampiranList = naskahAsli
        ? await this.naskahLampiranRepository.find({
            where: { id_naskah: naskahAsli.id },
          })
        : [];

      return {
        success: true,
        message: 'Info konsep berhasil diambil',
        data: {
          // Basic info
          konsep: {
            id: naskahKonsep.id,
            perihal: naskahKonsep.perihal,
            status: naskahKonsep.status,
            created_at: naskahKonsep.tanggal,
          },
          
          // Naskah asli (final document)
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
          
          // Pengirim naskah final
          pengirim: pengirimAsli ? {
            position_id: parseInt(pengirimAsli.position || '0'),
            position_text: pengirimAsli.positionText,
            nama: pengirimAsli.namaSirkuler,
          } : null,
          
          // Penerima & Tembusan naskah final
          penerima: penerimaAsliList.map((p) => ({
            position_id: parseInt(p.position || '0'),
            position_text: p.positionText,
            nama: p.namaSirkuler,
          })),
          tembusan: tembusanAsliList.map((t) => ({
            position_id: parseInt(t.position || '0'),
            position_text: t.positionText,
            nama: t.namaSirkuler,
          })),

          // Grup penerima & tembusan
          penerima_grup: await this.grupPenerimaService.getGrupInfoForResponse(
            [...new Set(penerimaAsliList.filter(p => p.idGrupPenerima).map(p => p.idGrupPenerima!))],
          ),
          tembusan_grup: await this.grupPenerimaService.getGrupInfoForResponse(
            [...new Set(tembusanAsliList.filter(t => t.idGrupPenerima).map(t => t.idGrupPenerima!))],
          ),
          
          // Lampiran
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
        error instanceof Error ? error.message : 'Gagal mendapatkan info konsep',
      );
    }
  }

  private async assertUserHasAccessToKonsepWorkflow(
    naskahKonsep: NaskahEntity,
    userPosition: string,
  ): Promise<void> {
    const relatedNaskahIds = new Set<string>([naskahKonsep.id]);

    if (naskahKonsep.id_naskah_asli) {
      relatedNaskahIds.add(naskahKonsep.id_naskah_asli);

      const workflowKonsep = await this.naskahRepository.find({
        where: { id_naskah_asli: naskahKonsep.id_naskah_asli, jenis: 'K' },
        select: ['id'],
      });

      for (const konsep of workflowKonsep) {
        relatedNaskahIds.add(konsep.id);
      }
    }

    const access = await this.naskahSirkulasiRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.position = :position', { position: String(userPosition) })
      .andWhere('s.idNaskah IN (:...ids)', { ids: Array.from(relatedNaskahIds) })
      .limit(1)
      .getRawOne();

    if (!access) {
      throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
    }
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
        kepadaYth: body.kepada_yth || body.kepadaYth || penerimaArray.join('; ') || '',
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
    } else if (jenis === 'SDI') {
      // SDI - Surat Dinas Internal (Bahasa Indonesia)
      return {
        html: htmlContent,
        filename: `konsep-surat-dinas-internal-${Date.now()}.pdf`,
        penerima: penerimaArray,
        kepadaYth: body.kepada_yth || body.kepadaYth || penerimaArray.join('; ') || '',
        alamat: body.alamat || '',
        dari: body.dari || body.nama_jabatan || '',
        perihal: body.perihal || '',
        tanggal: body.tanggal || body.tgl || '',
        positionText: body.nama_jabatan || '',
        namaLengkap: body.nama_lengkap || '',
        nama_jabatan: body.nama_jabatan || '',
        tembusan: tembusanArray,
        nama_tempat: body.nama_tempat || 'Tangerang',
        sifat: body.sifat || 'Biasa',
        lampiran: body.lampiran_text || body.lampiran || '-',
        nomor: body.nomor || '',
        headerKantor: body.header_kantor,
        headerGedung: body.header_gedung,
        headerAlamat: body.header_alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
        english: false, // SDI menggunakan format Bahasa Indonesia
      };
    } else {
      // SDE - Surat Dinas Eksternal (Bahasa Inggris)
      return {
        html: htmlContent,
        filename: `konsep-surat-dinas-eksternal-${Date.now()}.pdf`,
        penerima: penerimaArray,
        kepadaYth: body.kepada_yth || body.kepadaYth || penerimaArray.join('; ') || '',
        alamat: body.alamat || '',
        dari: body.dari || body.nama_jabatan || '',
        perihal: body.perihal || '',
        tanggal: body.tanggal || body.tgl || '',
        positionText: body.nama_jabatan || '',
        namaLengkap: body.nama_lengkap || '',
        nama_jabatan: body.nama_jabatan || '',
        tembusan: tembusanArray,
        nama_tempat: body.nama_tempat || 'Tangerang',
        sifat: body.sifat || 'Biasa',
        lampiran: body.lampiran_text || body.lampiran || '-',
        nomor: body.nomor || '',
        headerKantor: body.header_kantor,
        headerGedung: body.header_gedung,
        headerAlamat: body.header_alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
        english: true, // SDE menggunakan format Bahasa Inggris
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

      // Convert pdf_snapshot paths to URLs
      const riwayatWithUrls = await Promise.all(
        riwayatList.map(async (r) => {
          let pdfSnapshotUrl: string | null = null;
          if (r.pdfSnapshot) {
            pdfSnapshotUrl = await this.storageService.getFileUrl(r.pdfSnapshot);
          }

          return {
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
            pdf_snapshot: pdfSnapshotUrl,
            created_at: r.createdAt,
            created_by: r.createdBy,
          };
        }),
      );

      return {
        success: true,
        message: 'Riwayat konsep berhasil diambil',
        data: {
          id_konsep: id,
          perihal: naskahKonsep.perihal,
          status: naskahKonsep.status,
          total_langkah: riwayatList.length,
          riwayat: riwayatWithUrls,
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
  // HELPER: GET HEADER INFO BY USER
  // ==========================================

  /**
   * Get dynamic header info dari sub_area_alamat berdasarkan user context
   * @param company - Company ID
   * @param area - Area code
   * @param subArea - SubArea code
   * @param tanggal - Optional date for lookup
   * @returns Header info (kantor, gedung, alamat, kota) atau null jika tidak ditemukan
   */
  private async getHeaderInfoByArea(
    company: string,
    area: string | null,
    subArea: string | null,
    tanggal?: Date,
  ): Promise<{ kantor: string; gedung: string; alamat: string; kota: string } | null> {
    try {
      if (!area || !subArea) {
        return null;
      }

      const queryDate = tanggal || new Date();

      const headerInfo = await this.subAreaAlamatService.findAlamatByUserContext(
        company,
        area,
        subArea,
        queryDate,
      );

      return headerInfo;
    } catch (error) {
      console.error('[Konsep getHeaderInfoByArea] Error:', error);
      return null;
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
   * @param queryRunner Optional QueryRunner untuk akses data dalam transaksi
   * @returns URL file PDF di storage atau null jika gagal
   */
  private async generateAndUploadPdfSnapshot(
    naskahAsli: NaskahEntity,
    jenis: 'ND' | 'SDI' | 'SDE',
    aksi: string,
    urutan: number,
    queryRunner?: any,
  ): Promise<string | null> {
    try {
      // 1. Prepare data untuk generate PDF
      // Convert Date to string format for PDF generation
      const tanggalDate = naskahAsli.tanggal || new Date();
      const tanggalString = tanggalDate instanceof Date 
        ? tanggalDate.toISOString().split('T')[0] 
        : String(tanggalDate);

      // 2. Get penerima and tembusan dari sirkulasi
      // Gunakan queryRunner.manager jika ada (dalam transaksi), fallback ke repository
      let sirkulasiPenerima: NaskahSirkulasi[];
      let sirkulasiTembusan: NaskahSirkulasi[];
      let sirkulasiPengirim: NaskahSirkulasi | null;

      if (queryRunner) {
        sirkulasiPenerima = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahAsli.id, sirkuler: 'penerima' },
        });
        sirkulasiTembusan = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahAsli.id, sirkuler: 'tembusan' },
        });
        sirkulasiPengirim = await queryRunner.manager.findOne(NaskahSirkulasi, {
          where: { idNaskah: naskahAsli.id, sirkuler: 'pengirim' },
        });
      } else {
        sirkulasiPenerima = await this.naskahSirkulasiRepository.find({
          where: { idNaskah: naskahAsli.id, sirkuler: 'penerima' },
        });
        sirkulasiTembusan = await this.naskahSirkulasiRepository.find({
          where: { idNaskah: naskahAsli.id, sirkuler: 'tembusan' },
        });
        sirkulasiPengirim = await this.naskahSirkulasiRepository.findOne({
          where: { idNaskah: naskahAsli.id, sirkuler: 'pengirim' },
        });
      }

      // Build penerima and tembusan arrays
      const penerimaArray = sirkulasiPenerima.map(s => s.positionText || s.namaSirkuler || '');
      const tembusanArray = sirkulasiTembusan.map(s => s.positionText || s.namaSirkuler || '');

      const namaJabatan = sirkulasiPengirim?.positionText || '';
      const namaLengkap = sirkulasiPengirim?.namaSirkuler || '';

      // 3. Get header info dari sub_area_alamat berdasarkan pengirim
      const company = String(COMPANY_ID);
      const area = sirkulasiPengirim?.area || '';
      const subArea = sirkulasiPengirim?.subArea || '';
      const headerInfo = await this.getHeaderInfoByArea(company, area, subArea, tanggalDate instanceof Date ? tanggalDate : new Date());
      
      // Use kota from headerInfo if available
      const namaTempat = headerInfo?.kota || naskahAsli.tempat || 'Tangerang';

      // 4. Generate preview QR code (placeholder untuk konsep snapshot)
      const previewQrHtml = await this.qrCodeService.generatePreviewQRCodeHtml();

      // 5. Build PDF body based on jenis
      let pdfBody: any;
      let pdfBuffer: Buffer;

      if (jenis === 'ND') {
        // ND - Nota Dinas menggunakan generatePdfNodinService
        pdfBody = {
          html: naskahAsli.konten || '',
          htmlContent: naskahAsli.konten || '',
          filename: `snapshot-nota-dinas-${aksi}-${urutan}-${Date.now()}.pdf`,
          tertuju: penerimaArray, // ND uses 'tertuju'
          dari: namaJabatan, // ND uses 'dari' for sender
          perihal: naskahAsli.perihal || '',
          tanggal: tanggalString,
          tgl: tanggalString,
          positionText: namaJabatan,
          namaLengkap: namaLengkap,
          tembusan: tembusanArray,
          nama_tempat: namaTempat,
          nomor: naskahAsli.nomor || '',
          sifat: naskahAsli.sifat || 'biasa',
          lampiran: naskahAsli.lampiran || '-',
          // Dynamic header info dari sub_area_alamat
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML untuk tanda tangan
          qrCodeHtml: previewQrHtml,
        };
        pdfBuffer = await this.generatePdfNodinService.generatePdf(pdfBody);
      } else if (jenis === 'SDI') {
        // SDI - Surat Dinas Internal menggunakan generatePdfSudinService (Bahasa Indonesia)
        pdfBody = {
          html: naskahAsli.konten || '',
          htmlContent: naskahAsli.konten || '',
          filename: `snapshot-surat-dinas-internal-${aksi}-${urutan}-${Date.now()}.pdf`,
          penerima: penerimaArray, // SDI uses 'penerima'
          kepadaYth: penerimaArray.join('; ') || '',
          dari: namaJabatan,
          perihal: naskahAsli.perihal || '',
          tanggal: tanggalString,
          positionText: namaJabatan,
          namaLengkap: namaLengkap,
          nama_jabatan: namaJabatan,
          tembusan: tembusanArray,
          nama_tempat: namaTempat,
          nomor: naskahAsli.nomor || '',
          sifat: naskahAsli.sifat || 'Biasa',
          lampiran: naskahAsli.lampiran || '-',
          english: false, // SDI menggunakan format Bahasa Indonesia
          // Dynamic header info dari sub_area_alamat
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML untuk tanda tangan
          qrCodeHtml: previewQrHtml,
        };
        pdfBuffer = await this.generatePdfSudinService.generatePdf(pdfBody);
      } else {
        // SDE - Surat Dinas Eksternal menggunakan generatePdfSudinService (Bahasa Inggris)
        pdfBody = {
          html: naskahAsli.konten || '',
          htmlContent: naskahAsli.konten || '',
          filename: `snapshot-surat-dinas-eksternal-${aksi}-${urutan}-${Date.now()}.pdf`,
          penerima: penerimaArray, // SDE uses 'penerima'
          kepadaYth: penerimaArray.join('; ') || '',
          dari: namaJabatan,
          perihal: naskahAsli.perihal || '',
          tanggal: tanggalString,
          positionText: namaJabatan,
          namaLengkap: namaLengkap,
          nama_jabatan: namaJabatan,
          tembusan: tembusanArray,
          nama_tempat: namaTempat,
          nomor: naskahAsli.nomor || '',
          sifat: naskahAsli.sifat || 'Biasa',
          lampiran: naskahAsli.lampiran || '-',
          english: true, // SDE menggunakan format Bahasa Inggris
          // Dynamic header info dari sub_area_alamat
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML untuk tanda tangan
          qrCodeHtml: previewQrHtml,
        };
        pdfBuffer = await this.generatePdfSudinService.generatePdf(pdfBody);
      }

      // 6. Upload to storage
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

      // Return key (path) to be stored in database, not URL
      // URL will be generated dynamically when needed via getFileUrl()
      return uploadResult.key;
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

  // ==========================================
  // DRAFT KONSEP METHODS
  // ==========================================

  /**
   * CREATE DRAFT KONSEP
   * 
   * Membuat naskah draft (status='draf') yang belum dikirim ke pemeriksa.
   * Draft konsep hanya membuat naskah asli (ND/SDI/SDE), belum ada workflow K.
   * 
   * @param dto CreateDraftKonsepDto
   * @returns CreateDraftKonsepResponseDto
   */
  async createDraftKonsep(dto: any): Promise<any> {
    const barisData = await this.getPositionData();
    const fromPos = this.findByPosition(barisData, dto.from_position_id);

    if (!fromPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tanggalHariIni = new Date();
      const naskahDraftId = uuidv4();

      // Create naskah draft (status='draf')
      const naskahDraft = this.naskahRepository.create({
        id: naskahDraftId,
        jenis: dto.jenis,
        klasifikasi: dto.klasifikasi || null,
        klasifikasi_text: dto.klasifikasi_text || null,
        sifat: dto.sifat || 'biasa',
        nomor: '-', // Draft tidak punya nomor
        tanggal: dto.tgl ? new Date(dto.tgl) : tanggalHariIni,
        perihal: dto.perihal || null,
        konten: dto.konten || null,
        tempat: dto.nama_tempat || fromPos.sub_area_text || 'Tangerang',
        status: 'draf', // Status draft
        // Catatan disimpan di field terpisah atau di metadata
      });

      // Simpan catatan konsep jika ada (gunakan field yang tersedia atau di lampiran metadata)
      if (dto.catatan) {
        (naskahDraft as any).catatan_konsep = dto.catatan;
      }

      await queryRunner.manager.save(naskahDraft);

      // Create sirkulasi pengirim (pembuat draft)
      const sirkulasiPengirim = this.createSirkulasi(naskahDraftId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(sirkulasiPengirim);

      // Handle penerima naskah final (jika sudah diisi)
      if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
        for (const posId of dto.penerima_position_ids) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahDraftId, 'penerima', pos, false);
          await queryRunner.manager.save(sirkulasi);
        }
      } else if (dto.kepada_yth) {
        // Penerima text untuk SDE
        const sirkulasiPenerima = new NaskahSirkulasi();
        sirkulasiPenerima.id = uuidv4();
        sirkulasiPenerima.idNaskah = naskahDraftId;
        sirkulasiPenerima.sirkuler = 'penerima';
        sirkulasiPenerima.company = String(COMPANY_ID);
        sirkulasiPenerima.positionText = dto.kepada_yth;
        sirkulasiPenerima.namaSirkuler = dto.kepada_yth;
        sirkulasiPenerima.isKonsep = 0;
        if (dto.alamat) sirkulasiPenerima.alamat = dto.alamat;
        await queryRunner.manager.save(sirkulasiPenerima);
      }

      // Handle tembusan (jika sudah diisi)
      if (dto.tembusan_position_ids && dto.tembusan_position_ids.length > 0) {
        for (const posId of dto.tembusan_position_ids) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;
          const sirkulasi = this.createSirkulasi(naskahDraftId, 'tembusan', pos, false);
          await queryRunner.manager.save(sirkulasi);
        }
      } else if (dto.tembusan) {
        const sirkulasiTembusan = new NaskahSirkulasi();
        sirkulasiTembusan.id = uuidv4();
        sirkulasiTembusan.idNaskah = naskahDraftId;
        sirkulasiTembusan.sirkuler = 'tembusan';
        sirkulasiTembusan.company = String(COMPANY_ID);
        sirkulasiTembusan.positionText = dto.tembusan;
        sirkulasiTembusan.namaSirkuler = dto.tembusan;
        sirkulasiTembusan.isKonsep = 0;
        await queryRunner.manager.save(sirkulasiTembusan);
      }

      // Handle tanda tangan
      if (dto.tanda_tangan) {
        naskahDraft.tandaTangan = dto.tanda_tangan;
        await queryRunner.manager.save(naskahDraft);
      }

      // Handle lampiran
      let jumlahLampiran = 0;
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.handleLampiranTempIds(naskahDraftId, dto.lampiran_temp_ids, dto.jenis);
        jumlahLampiran = dto.lampiran_temp_ids.length;
      } else if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahDraftId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: dto.jenis,
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
        jumlahLampiran = dto.lampiran.length;
      }

      if (jumlahLampiran > 0) {
        naskahDraft.lampiran = `${jumlahLampiran} file`;
        await queryRunner.manager.save(naskahDraft);
      }

      // Simpan referensi disposisi jika ada
      if (dto.id_disposisi_referensi) {
        const disposisiRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_disposisi_referensi, jenis: 'DI' },
        });

        if (disposisiRef) {
          const naskahReferensi = new NaskahReferensiEntity();
          naskahReferensi.id = uuidv4();
          naskahReferensi.id_naskah = naskahDraftId;
          naskahReferensi.ref_jenis = 'DI';
          naskahReferensi.ref_nomor = disposisiRef.nomor;
          naskahReferensi.ref_tanggal = disposisiRef.tanggal;
          naskahReferensi.ref_perihal = disposisiRef.perihal;
          await queryRunner.manager.save(naskahReferensi);
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Draft konsep berhasil disimpan',
        data: {
          id_draft: naskahDraftId,
          jenis: dto.jenis,
          from: {
            position_id: fromPos.position,
            position_text: fromPos.position_text,
            nama: fromPos.persnum_person_text,
          },
          status: 'draf',
          created_at: tanggalHariIni,
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
   * GET DRAFT KONSEP LIST
   * 
   * Mendapatkan list draft konsep milik user (naskah dengan status='draf' dan jenis ND/SDI/SDE)
   * 
   * @param positionId Position ID pembuat
   * @param jenis Filter by jenis (ND/SDI/SDE)
   * @param search Search by perihal
   * @param startDate Start date filter
   * @param endDate End date filter
   * @param preset Date preset
   * @param page Page number
   * @param limit Items per page
   * @returns GetDraftKonsepListResponseDto
   */
  async getDraftKonsepList(
    positionId: number,
    jenis?: 'ND' | 'SDI' | 'SDE',
    search?: string,
    startDate?: string,
    endDate?: string,
    preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua',
    page: number = 1,
    limit: number = 10,
  ): Promise<any> {
    // Calculate date range
    const dateRange = this.getDateRangeFromQuery(startDate, endDate, preset);

    // Get sirkulasi records for this position as pengirim with status draf
    const sirkulasiRecords = await this.naskahSirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .where('sirkulasi.sirkuler = :sirkuler', { sirkuler: 'pengirim' })
      .andWhere('sirkulasi.position = :position', { position: String(positionId) })
      .andWhere('sirkulasi.is_konsep = :isKonsep', { isKonsep: 0 })
      .getMany();

    const naskahIdsFromSirkulasi = sirkulasiRecords.map(s => s.idNaskah);

    if (naskahIdsFromSirkulasi.length === 0) {
      return {
        success: true,
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    // Build query for draft naskah (jenis ND/SDI/SDE with status draf)
    const queryBuilder = this.naskahRepository
      .createQueryBuilder('naskah')
      .where('naskah.id IN (:...naskahIds)', { naskahIds: naskahIdsFromSirkulasi })
      .andWhere('naskah.status = :status', { status: 'draf' })
      .andWhere('naskah.jenis IN (:...jenisTypes)', { jenisTypes: ['ND', 'SDI', 'SDE'] });

    // Apply date filter
    if (dateRange.startDate) {
      queryBuilder.andWhere('DATE(naskah.tanggal) >= :startDate', { startDate: dateRange.startDate });
    }
    if (dateRange.endDate) {
      queryBuilder.andWhere('DATE(naskah.tanggal) <= :endDate', { endDate: dateRange.endDate });
    }

    // Filter by jenis if provided
    if (jenis) {
      queryBuilder.andWhere('naskah.jenis = :jenis', { jenis });
    }

    // Search by perihal
    if (search) {
      queryBuilder.andWhere('naskah.perihal LIKE :search', { search: `%${search}%` });
    }

    // Order by created_at desc
    queryBuilder.orderBy('naskah.createdAt', 'DESC').addOrderBy('naskah.id', 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Apply pagination
    queryBuilder.skip(offset).take(limit);
    const naskahs = await queryBuilder.getMany();

    // Build response items
    const jenisTextMap: Record<string, string> = {
      ND: 'Nota Dinas',
      SDI: 'Surat Dinas Internal',
      SDE: 'Surat Dinas Eksternal',
    };

    const items = await Promise.all(
      naskahs.map(async (naskah) => {
        // Get penerima count
        const penerimaCount = await this.naskahSirkulasiRepository.count({
          where: { idNaskah: naskah.id, sirkuler: 'penerima' },
        });

        // Get lampiran count
        const lampiranCount = await this.naskahLampiranRepository.count({
          where: { id_naskah: naskah.id },
        });

        // Format waktu
        const tanggal = new Date(naskah.tanggal);
        const waktuUTC = `${String(tanggal.getUTCHours()).padStart(2, '0')}:${String(tanggal.getUTCMinutes()).padStart(2, '0')}`;

        return {
          id_draft: naskah.id,
          jenis: naskah.jenis as 'ND' | 'SDI' | 'SDE',
          jenis_text: jenisTextMap[naskah.jenis] || naskah.jenis,
          perihal: naskah.perihal || '-',
          sifat: naskah.sifat || 'biasa',
          klasifikasi_text: naskah.klasifikasi_text || null,
          tanggal: naskah.tanggal,
          waktu: waktuUTC,
          penerima_count: penerimaCount,
          lampiran_count: lampiranCount,
        };
      }),
    );

    return {
      success: true,
      data: items,
      pagination: { total, page, limit, totalPages },
    };
  }

  /**
   * Helper: Calculate date range from query parameters
   */
  private getDateRangeFromQuery(
    startDate?: string,
    endDate?: string,
    preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua',
  ): { startDate: string | null; endDate: string | null } {
    if (preset === 'semua') {
      return { startDate: null, endDate: null };
    }

    if (startDate || endDate) {
      return { startDate: startDate || null, endDate: endDate || null };
    }

    if (preset) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      let daysBack: number;
      switch (preset) {
        case '7_hari': daysBack = 7; break;
        case '30_hari': daysBack = 30; break;
        case '60_hari': daysBack = 60; break;
        case '1_tahun': daysBack = 365; break;
        default: return { startDate: null, endDate: null };
      }

      const startDateCalc = new Date(today);
      startDateCalc.setDate(startDateCalc.getDate() - daysBack);
      return { startDate: startDateCalc.toISOString().split('T')[0], endDate: todayStr };
    }

    // Default: 30 hari
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const startDateCalc = new Date(today);
    startDateCalc.setDate(startDateCalc.getDate() - 30);
    return { startDate: startDateCalc.toISOString().split('T')[0], endDate: todayStr };
  }

  /**
   * GET DRAFT KONSEP DETAIL
   * 
   * @param idDraft ID naskah draft
   * @param positionId Position ID untuk validasi ownership
   * @returns GetDraftKonsepDetailResponseDto
   */
  async getDraftKonsepDetail(idDraft: string, positionId: number): Promise<any> {
    const naskah = await this.naskahRepository.findOne({ where: { id: idDraft } });

    if (!naskah) {
      throw new NotFoundException(`Draft dengan ID ${idDraft} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(`Naskah ini bukan draft (status: ${naskah.status})`);
    }

    if (!['ND', 'SDI', 'SDE'].includes(naskah.jenis)) {
      throw new ForbiddenException(`Naskah ini bukan draft konsep (jenis: ${naskah.jenis})`);
    }

    // Validate ownership
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: idDraft, sirkuler: 'pengirim' },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk draft ${idDraft}`);
    }

    if (String(pengirimSirkulasi.position) !== String(positionId)) {
      throw new ForbiddenException(`Anda tidak memiliki akses ke draft ini`);
    }

    // Get penerima
    const penerimaList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: idDraft, sirkuler: 'penerima' },
    });

    const penerima = penerimaList.map(p => ({
      position_id: Number(p.position) || 0,
      position_text: p.positionText || '',
      nama: p.namaSirkuler || null,
    }));

    // Get tembusan
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: idDraft, sirkuler: 'tembusan' },
    });

    const tembusan = tembusanList.map(t => ({
      position_id: Number(t.position) || 0,
      position_text: t.positionText || '',
      nama: t.namaSirkuler || null,
    }));

    // Get lampiran
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: idDraft },
    });

    const lampiran = lampiranList.map(l => ({
      id: l.id,
      nama_file: l.file_name || '',
      url: l.file_pdf || '',
    }));

    // Get referensi disposisi
    let disposisiReferensi: { id: string; nomor: string; perihal: string | null } | null = null;
    const referensiData = await this.naskahReferensiRepository.findOne({
      where: { id_naskah: idDraft, ref_jenis: 'DI' },
    });
    if (referensiData) {
      disposisiReferensi = {
        id: referensiData.id,
        nomor: referensiData.ref_nomor || '',
        perihal: referensiData.ref_perihal || null,
      };
    }

    const jenisTextMap: Record<string, string> = {
      ND: 'Nota Dinas',
      SDI: 'Surat Dinas Internal',
      SDE: 'Surat Dinas Eksternal',
    };

    // Check kepada_yth text for SDE
    let penerimaText: string | null = null;
    if (naskah.jenis === 'SDE' && penerimaList.length > 0 && !penerimaList[0].position) {
      penerimaText = penerimaList[0].positionText || penerimaList[0].namaSirkuler || null;
    }

    let tembusanText: string | null = null;
    if (tembusanList.length > 0 && !tembusanList[0].position) {
      tembusanText = tembusanList[0].positionText || tembusanList[0].namaSirkuler || null;
    }

    return {
      success: true,
      data: {
        id_draft: naskah.id,
        jenis: naskah.jenis as 'ND' | 'SDI' | 'SDE',
        jenis_text: jenisTextMap[naskah.jenis] || naskah.jenis,
        from_position_id: Number(pengirimSirkulasi.position),
        from_position_text: pengirimSirkulasi.positionText || '',
        from_nama: pengirimSirkulasi.namaSirkuler || null,
        from_organization_text: pengirimSirkulasi.organizationText || null,
        perihal: naskah.perihal || null,
        konten: naskah.konten || null,
        sifat: naskah.sifat || 'biasa',
        klasifikasi: naskah.klasifikasi || null,
        klasifikasi_text: naskah.klasifikasi_text || null,
        tanggal: naskah.tanggal,
        penerima: penerima.length > 0 ? penerima : undefined,
        penerima_text: penerimaText,
        tembusan: tembusan.length > 0 ? tembusan : undefined,
        tembusan_text: tembusanText,
        penerima_grup: await this.grupPenerimaService.getGrupInfoForResponse(
          [...new Set(penerimaList.filter(p => p.idGrupPenerima).map(p => p.idGrupPenerima!))],
        ),
        tembusan_grup: await this.grupPenerimaService.getGrupInfoForResponse(
          [...new Set(tembusanList.filter(t => t.idGrupPenerima).map(t => t.idGrupPenerima!))],
        ),
        lampiran: lampiran.length > 0 ? lampiran : undefined,
        disposisi_referensi: disposisiReferensi,
        catatan: (naskah as any).catatan_konsep || null,
        status: 'draf',
        created_at: naskah.tanggal,
        updated_at: naskah.tanggal,
      },
    };
  }

  /**
   * UPDATE DRAFT KONSEP
   * 
   * @param idDraft ID naskah draft
   * @param dto UpdateDraftKonsepDto
   * @returns UpdateDraftKonsepResponseDto
   */
  async updateDraftKonsep(idDraft: string, dto: any): Promise<any> {
    const naskah = await this.naskahRepository.findOne({ where: { id: idDraft } });

    if (!naskah) {
      throw new NotFoundException(`Draft dengan ID ${idDraft} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(`Naskah ini bukan draft (status: ${naskah.status})`);
    }

    // Validate ownership
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: idDraft, sirkuler: 'pengirim' },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk draft ${idDraft}`);
    }

    if (String(pengirimSirkulasi.position) !== String(dto.from_position_id)) {
      throw new ForbiddenException(`Anda tidak memiliki akses untuk mengupdate draft ini`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Jika action = 'kirim', convert draft ke konsep workflow
      if (dto.action === 'kirim') {
        if (!dto.to_position_id) {
          throw new BadRequestException('Penerima konsep (to_position_id) harus diisi untuk mengirim');
        }

        const barisData = await this.getPositionData();
        const fromPos = this.findByPosition(barisData, dto.from_position_id);
        const toPos = this.findByPosition(barisData, dto.to_position_id);

        if (!fromPos) {
          throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
        }
        if (!toPos) {
          throw new NotFoundException(`Position ${dto.to_position_id} tidak ditemukan`);
        }

        // Update fields on naskah asli
        if (dto.jenis) naskah.jenis = dto.jenis;
        if (dto.perihal) naskah.perihal = dto.perihal;
        if (dto.konten) naskah.konten = dto.konten;
        if (dto.klasifikasi) naskah.klasifikasi = dto.klasifikasi;
        if (dto.klasifikasi_text) naskah.klasifikasi_text = dto.klasifikasi_text;
        if (dto.sifat) naskah.sifat = dto.sifat;
        if (dto.tgl) naskah.tanggal = new Date(dto.tgl);
        if (dto.tanda_tangan) naskah.tandaTangan = dto.tanda_tangan;
        naskah.status = 'final';

        // ==========================================
        // 1. CREATE NASKAH KONSEP WORKFLOW (jenis='K')
        // ==========================================
        const naskahKonsepId = uuidv4();
        const perihalKonsep = dto.catatan || 'Mohon review dan approval';
        
        const naskahKonsep = this.naskahRepository.create({
          id: naskahKonsepId,
          jenis: 'K',
          nomor: 'KONSEP-001',
          tanggal: new Date(),
          perihal: perihalKonsep,
          sifat: 'biasa',
          status: 'final',
          id_naskah_asli: idDraft,
          id_naskah_parent: null,
        });
        await queryRunner.manager.save(naskahKonsep);

        // Update naskah asli dengan link ke konsep workflow
        naskah.id_naskah_konsep = naskahKonsepId;
        await queryRunner.manager.save(naskah);

        // ==========================================
        // 2. CREATE SIRKULASI FOR KONSEP WORKFLOW (K)
        // ==========================================
        const sirkulasiKonsepPengirim = this.createSirkulasi(naskahKonsepId, 'pengirim', fromPos, false);
        await queryRunner.manager.save(sirkulasiKonsepPengirim);

        const sirkulasiKonsepPenerima = this.createSirkulasi(naskahKonsepId, 'penerima', toPos, false);
        await queryRunner.manager.save(sirkulasiKonsepPenerima);

        // ==========================================
        // 3. UPDATE SIRKULASI FOR NASKAH ASLI (is_konsep=1)
        // ==========================================
        // Update existing pengirim sirkulasi to is_konsep=1
        await queryRunner.manager.update(NaskahSirkulasi, 
          { idNaskah: idDraft, sirkuler: 'pengirim' },
          { isKonsep: 1 }
        );

        // Update penerima & tembusan to is_konsep=1
        await queryRunner.manager.update(NaskahSirkulasi,
          { idNaskah: idDraft, sirkuler: 'penerima' },
          { isKonsep: 1 }
        );
        await queryRunner.manager.update(NaskahSirkulasi,
          { idNaskah: idDraft, sirkuler: 'tembusan' },
          { isKonsep: 1 }
        );

        // ==========================================
        // 4. SAVE RIWAYAT KONSEP
        // ==========================================
        await this.saveRiwayat(
          queryRunner,
          naskahKonsepId,
          1,
          dto.from_position_id,
          fromPos.position_text,
          fromPos.persnum_person_text,
          dto.to_position_id,
          toPos.position_text,
          toPos.persnum_person_text,
          'create',
          dto.catatan || null,
          fromPos.persnum_person,
          null,
        );

        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Draft berhasil dikirim ke pemeriksa',
          data: {
            id_draft: idDraft,
            id_konsep: naskahKonsepId,
            status: 'final',
            updated_at: new Date(),
          },
        };
      }

      // Action = 'draft' or undefined: just update the draft
      // Save jenis sebelum update untuk handle lampiran
      const jenisNaskah = naskah.jenis;
      
      if (dto.jenis) naskah.jenis = dto.jenis;
      if (dto.perihal !== undefined) naskah.perihal = dto.perihal;
      if (dto.konten !== undefined) naskah.konten = dto.konten;
      if (dto.klasifikasi !== undefined) naskah.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskah.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat) naskah.sifat = dto.sifat;
      if (dto.tgl) naskah.tanggal = new Date(dto.tgl);
      if (dto.tanda_tangan) naskah.tandaTangan = dto.tanda_tangan;
      if (dto.catatan) (naskah as any).catatan_konsep = dto.catatan;

      await queryRunner.manager.save(naskah);

      // Update penerima if provided
      const barisData = await this.getPositionData();

      if (dto.penerima_position_ids || dto.kepada_yth) {
        // Delete existing penerima
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: idDraft,
          sirkuler: 'penerima',
        });

        // Add new penerima
        if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
          for (const posId of dto.penerima_position_ids) {
            const pos = this.findByPosition(barisData, posId);
            if (!pos) continue;
            const sirkulasi = this.createSirkulasi(idDraft, 'penerima', pos, false);
            await queryRunner.manager.save(sirkulasi);
          }
        } else if (dto.kepada_yth) {
          const sirkulasiPenerima = new NaskahSirkulasi();
          sirkulasiPenerima.id = uuidv4();
          sirkulasiPenerima.idNaskah = idDraft;
          sirkulasiPenerima.sirkuler = 'penerima';
          sirkulasiPenerima.company = String(COMPANY_ID);
          sirkulasiPenerima.positionText = dto.kepada_yth;
          sirkulasiPenerima.namaSirkuler = dto.kepada_yth;
          sirkulasiPenerima.isKonsep = 0;
          if (dto.alamat) sirkulasiPenerima.alamat = dto.alamat;
          await queryRunner.manager.save(sirkulasiPenerima);
        }
      }

      // Update tembusan if provided
      if (dto.tembusan_position_ids || dto.tembusan) {
        // Delete existing tembusan
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: idDraft,
          sirkuler: 'tembusan',
        });

        // Add new tembusan
        if (dto.tembusan_position_ids && dto.tembusan_position_ids.length > 0) {
          for (const posId of dto.tembusan_position_ids) {
            const pos = this.findByPosition(barisData, posId);
            if (!pos) continue;
            const sirkulasi = this.createSirkulasi(idDraft, 'tembusan', pos, false);
            await queryRunner.manager.save(sirkulasi);
          }
        } else if (dto.tembusan) {
          const sirkulasiTembusan = new NaskahSirkulasi();
          sirkulasiTembusan.id = uuidv4();
          sirkulasiTembusan.idNaskah = idDraft;
          sirkulasiTembusan.sirkuler = 'tembusan';
          sirkulasiTembusan.company = String(COMPANY_ID);
          sirkulasiTembusan.positionText = dto.tembusan;
          sirkulasiTembusan.namaSirkuler = dto.tembusan;
          sirkulasiTembusan.isKonsep = 0;
          await queryRunner.manager.save(sirkulasiTembusan);
        }
      }

      // Handle new lampiran
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        // Use updated jenis or fallback to original
        const currentJenis = (dto.jenis || jenisNaskah) as 'ND' | 'SDI' | 'SDE';
        await this.handleLampiranTempIds(idDraft, dto.lampiran_temp_ids, currentJenis);
        
        // Update lampiran count
        const lampiranCount = await queryRunner.manager.count(NaskahLampiranEntity, { where: { id_naskah: idDraft } });
        if (lampiranCount > 0) {
          // Reload naskah or update directly via queryRunner
          await queryRunner.manager.update(NaskahEntity, 
            { id: idDraft }, 
            { lampiran: `${lampiranCount} file` }
          );
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Draft konsep berhasil diupdate',
        data: {
          id_draft: idDraft,
          status: 'draf',
          updated_at: new Date(),
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
   * DELETE DRAFT KONSEP
   * 
   * @param idDraft ID naskah draft
   * @param positionId Position ID untuk validasi ownership
   * @returns DeleteDraftKonsepResponseDto
   */
  async deleteDraftKonsep(idDraft: string, positionId: number): Promise<any> {
    const naskah = await this.naskahRepository.findOne({ where: { id: idDraft } });

    if (!naskah) {
      throw new NotFoundException(`Draft dengan ID ${idDraft} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(`Hanya naskah dengan status 'draf' yang bisa dihapus. Status saat ini: '${naskah.status}'`);
    }

    // Validate ownership
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: idDraft, sirkuler: 'pengirim' },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk draft ${idDraft}`);
    }

    if (String(pengirimSirkulasi.position) !== String(positionId)) {
      throw new ForbiddenException(`Anda tidak memiliki akses untuk menghapus draft ini`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Delete lampiran
      await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: idDraft });

      // Delete referensi
      await queryRunner.manager.delete(NaskahReferensiEntity, { id_naskah: idDraft });

      // Delete sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: idDraft });

      // Delete naskah
      await queryRunner.manager.delete(NaskahEntity, { id: idDraft });

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Draft konsep berhasil dihapus',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * BULK DELETE DRAFT KONSEP
   * 
   * @param draftIds Array of draft IDs to delete
   * @param positionId Position ID untuk validasi ownership
   * @returns BulkDeleteDraftKonsepResponseDto
   */
  async bulkDeleteDraftKonsep(draftIds: string[], positionId: number): Promise<any> {
    const failedIds: string[] = [];
    let totalDeleted = 0;

    for (const draftId of draftIds) {
      try {
        await this.deleteDraftKonsep(draftId, positionId);
        totalDeleted++;
      } catch (error) {
        failedIds.push(draftId);
      }
    }

    return {
      success: true,
      message: totalDeleted > 0
        ? `Berhasil menghapus ${totalDeleted} draft konsep`
        : 'Tidak ada draft yang berhasil dihapus',
      data: {
        total_requested: draftIds.length,
        total_deleted: totalDeleted,
        failed_ids: failedIds,
      },
    };
  }

  /**
   * PARSE FORM DATA TO CREATE DRAFT DTO
   */
  async parseFormDataToCreateDraftDto(body: any, files?: { lampiran_files?: Express.Multer.File[] }): Promise<any> {
    const dto: any = {
      jenis: body.jenis,
      from_position_id: body.from_position_id ? parseInt(body.from_position_id, 10) : undefined,
      to_position_id: body.to_position_id ? parseInt(body.to_position_id, 10) : undefined,
      pengirim_position_id: body.pengirim_position_id ? parseInt(body.pengirim_position_id, 10) : undefined,
      id_disposisi_referensi: body.id_disposisi_referensi,
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
      catatan: body.catatan,
      kepada_yth: body.kepada_yth,
      alamat: body.alamat,
      dari: body.dari,
      tembusan: body.tembusan,
      tgl: body.tgl,
      tanda_tangan: body.tanda_tangan,
    };

    // Parse lampiran_temp_ids (array or string)
    if (body.lampiran_temp_ids) {
      dto.lampiran_temp_ids = Array.isArray(body.lampiran_temp_ids)
        ? body.lampiran_temp_ids
        : typeof body.lampiran_temp_ids === 'string' && body.lampiran_temp_ids.startsWith('[')
          ? JSON.parse(body.lampiran_temp_ids)
          : [body.lampiran_temp_ids];
    } else if (body['lampiran_temp_ids[]']) {
      dto.lampiran_temp_ids = Array.isArray(body['lampiran_temp_ids[]'])
        ? body['lampiran_temp_ids[]']
        : [body['lampiran_temp_ids[]']];
    }

    // Parse penerima_position_ids
    if (body.penerima_position_ids) {
      dto.penerima_position_ids = Array.isArray(body.penerima_position_ids)
        ? body.penerima_position_ids.map((id: string) => parseInt(id, 10))
        : typeof body.penerima_position_ids === 'string' && body.penerima_position_ids.startsWith('[')
          ? JSON.parse(body.penerima_position_ids).map((id: any) => parseInt(id, 10))
          : [parseInt(body.penerima_position_ids, 10)];
    } else if (body['penerima_position_ids[]']) {
      dto.penerima_position_ids = Array.isArray(body['penerima_position_ids[]'])
        ? body['penerima_position_ids[]'].map((id: string) => parseInt(id, 10))
        : [parseInt(body['penerima_position_ids[]'], 10)];
    }

    // Parse tembusan_position_ids
    if (body.tembusan_position_ids) {
      dto.tembusan_position_ids = Array.isArray(body.tembusan_position_ids)
        ? body.tembusan_position_ids.map((id: string) => parseInt(id, 10))
        : typeof body.tembusan_position_ids === 'string' && body.tembusan_position_ids.startsWith('[')
          ? JSON.parse(body.tembusan_position_ids).map((id: any) => parseInt(id, 10))
          : [parseInt(body.tembusan_position_ids, 10)];
    } else if (body['tembusan_position_ids[]']) {
      dto.tembusan_position_ids = Array.isArray(body['tembusan_position_ids[]'])
        ? body['tembusan_position_ids[]'].map((id: string) => parseInt(id, 10))
        : [parseInt(body['tembusan_position_ids[]'], 10)];
    }

    return dto;
  }

  /**
   * PARSE FORM DATA TO UPDATE DRAFT DTO
   */
  async parseFormDataToUpdateDraftDto(body: any, files?: { lampiran_files?: Express.Multer.File[] }): Promise<any> {
    const dto = await this.parseFormDataToCreateDraftDto(body, files);
    dto.action = body.action;
    return dto;
  }
}
