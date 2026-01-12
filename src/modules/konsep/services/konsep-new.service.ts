import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NdEntity } from '../../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../../surat-dinas-internal/entities/sdi_sde.entity';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { StorageService } from '../../storage/services/storage.service';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateKonsepDto,
  ForwardKonsepDto,
  FinalizeKonsepDto,
  CreateKonsepResponseDto,
  ForwardKonsepResponseDto,
  FinalizeKonsepResponseDto,
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
    @InjectRepository(NdEntity)
    private ndRepository: Repository<NdEntity>,
    @InjectRepository(SdiSdeEntity)
    private sdiSdeRepository: Repository<SdiSdeEntity>,
    private orgDataService: OrgDataService,
    private storageService: StorageService,
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

    // Validate hierarchy
    if (!this.validateHierarchy(barisData, dto.from_position_id, dto.to_position_id)) {
      throw new BadRequestException(
        `Position ${dto.to_position_id} bukan atasan dari position ${dto.from_position_id}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tanggalHariIni = new Date();
      
      // ==========================================
      // 1. CREATE NASKAH KONSEP WORKFLOW (jenis='K')
      // ==========================================
      const naskahKonsepId = uuidv4();
      const naskahKonsep = this.naskahRepository.create({
        id: naskahKonsepId,
        jenis: 'K',
        nomor: `K-${Date.now()}`,
        tanggal: tanggalHariIni,
        perihal: `Konsep ${dto.jenis}: ${dto.perihal || 'Tanpa Perihal'}`,
        sifat: 'biasa',
        status: 'draf',
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
        nomor: `DRAFT-${Date.now()}`, // Temporary, will be replaced on finalize
        tanggal: dto.tgl ? new Date(dto.tgl) : tanggalHariIni,
        lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : undefined,
        perihal: dto.perihal,
        konten: dto.konten,
        tempat: dto.nama_tempat || fromPos.sub_area_text || 'Tangerang',
        status: 'draf',
        id_naskah_konsep: naskahKonsepId, // Link to konsep workflow
      });
      await queryRunner.manager.save(naskahAsli);

      // Update naskah konsep with link to naskah asli
      naskahKonsep.id_naskah_asli = naskahAsliId;
      await queryRunner.manager.save(naskahKonsep);

      // ==========================================
      // 3. CREATE SIRKULASI FOR KONSEP WORKFLOW (K)
      // ==========================================
      // Pengirim konsep (pembuat)
      const sirkulasiKonsepPengirim = this.createSirkulasi(naskahKonsepId, 'pengirim', fromPos, true);
      await queryRunner.manager.save(sirkulasiKonsepPengirim);

      // Penerima konsep (reviewer/atasan)
      const sirkulasiKonsepPenerima = this.createSirkulasi(naskahKonsepId, 'penerima', toPos, true);
      await queryRunner.manager.save(sirkulasiKonsepPenerima);

      // ==========================================
      // 4. CREATE SIRKULASI FOR NASKAH ASLI (ND/SDI/SDE) with is_konsep=1
      // ==========================================
      // Pengirim naskah final (from_position_id atau bisa dari DTO)
      const pengirimPosId = dto.from_position_id; // Bisa juga dari field pengirim_position_id jika ada
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
      // 5. CREATE ND/SDI/SDE CONTENT
      // ==========================================
      if (dto.jenis === 'ND') {
        const ndEntity = this.ndRepository.create({
          id: uuidv4(),
          idNaskah: naskahAsliId,
          kopLogo: dto.kop_logo || DEFAULT_KOP_LOGO,
          kopNama: dto.kop_nama || DEFAULT_KOP_NAMA,
          alamatPerusahaan: dto.alamat_perusahaan || DEFAULT_ALAMAT_PERUSAHAAN,
          nomor: naskahAsli.nomor,
          kepadaYth: dto.kepada_yth,
          dari: dto.dari,
          perihal: dto.perihal,
          konten: dto.konten,
          namaTempat: dto.nama_tempat || fromPos.sub_area_text,
          tanggal: naskahAsli.tanggal,
          namaJabatan: dto.nama_jabatan,
          tandaTangan: dto.tanda_tangan,
          namaLengkap: dto.nama_lengkap,
          tembusan: dto.tembusan,
        });
        await queryRunner.manager.save(ndEntity);
      } else if (dto.jenis === 'SDI' || dto.jenis === 'SDE') {
        const sdiSdeEntity = this.sdiSdeRepository.create({
          id: uuidv4(),
          idNaskah: naskahAsliId,
          kopLogo: dto.kop_logo || DEFAULT_KOP_LOGO,
          kopNama: dto.kop_nama || DEFAULT_KOP_NAMA,
          alamatPerusahaan: dto.alamat_perusahaan || DEFAULT_ALAMAT_PERUSAHAAN,
          namaTempat: dto.nama_tempat || fromPos.sub_area_text,
          tanggal: naskahAsli.tanggal,
          nomor: naskahAsli.nomor,
          sifat: dto.sifat,
          lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : null,
          perihal: dto.perihal,
          kepadaYth: dto.kepada_yth,
          nama: dto.nama_lengkap,
          alamat: dto.alamat,
          konten: dto.konten,
          namaJabatan: dto.nama_jabatan,
          tandaTangan: dto.tanda_tangan,
          namaLengkap: dto.nama_lengkap,
          tembusan: dto.tembusan,
        });
        await queryRunner.manager.save(sdiSdeEntity);
      }

      // ==========================================
      // 6. HANDLE LAMPIRAN
      // ==========================================
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.handleLampiranTempIds(naskahAsliId, dto.lampiran_temp_ids, dto.jenis);
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
      }

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
        lampiran.id_naskah = naskahId;
        lampiran.is_temporary = 0;
        lampiran.jenis = jenis;
        await this.naskahLampiranRepository.save(lampiran);
      }
    }
  }

  // TODO: Implement other methods (forward, finalize, inbox, sent, etc.)
}
