import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NdEntity } from '../../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../../surat-dinas-internal/entities/sdi_sde.entity';
import { KonsepEntity } from '../entities/konsep.entity';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { StorageService } from '../../storage/services/storage.service';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateKonsepDto,
  ReviewKonsepDto,
  FinalizeKonsepDto,
  ForwardKonsepDto,
  CreateKonsepResponseDto,
  ReviewKonsepResponseDto,
  FinalizeKonsepResponseDto,
  ForwardKonsepResponseDto,
  KonsepInboxResponseDto,
  KonsepSentResponseDto,
  KonsepPositionInfoDto,
  KonsepListItemDto,
} from '../dto/konsep';

const COMPANY_ID = 10000;
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';

// Interface untuk data dari position_json (cached org data)
export interface PositionData {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number;
  departType: string | null;
  persnum_person: number | null;
  persnum_person_text: string | null;
  organization_id: number;
  organization_text: string;
  organization_abbreviation: string | null;
  organization_parent: number | null;
  organization_parent_text: string | null;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
  level: number;
  divisi_id: number | null;
  divisi_name: string | null;
  direktorat_id: number | null;
  direktorat_name: string | null;
  company: number | null;
  company_name: string | null;
}

// Response type untuk get-recipient
export interface KonsepRecipientResponse {
  sender: PositionData;
  recipients: {
    ATASAN: PositionData[];
  };
}

@Injectable()
export class KonsepService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NdEntity)
    private readonly ndRepository: Repository<NdEntity>,
    @InjectRepository(SdiSdeEntity)
    private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(KonsepEntity)
    private readonly konsepRepository: Repository<KonsepEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Get cached position_json from org_data
   */
  private async getPositionData(tgl?: string): Promise<PositionData[]> {
    const today = tgl || new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(today);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${today} tidak ditemukan. Silakan generate via GET /org-data?tgl=${today}`,
      );
    }
    return orgData.position_json as PositionData[];
  }

  /**
   * Find position data by position_id
   */
  private findByPosition(barisData: PositionData[], position: number): PositionData | undefined {
    return barisData.find((x) => Number(x.position) === Number(position));
  }

  /**
   * Convert PositionData to KonsepPositionInfoDto
   */
  private toPositionInfo(pos: PositionData, actor: string): KonsepPositionInfoDto {
    return {
      position_id: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum_person ? String(pos.persnum_person) : null,
      nama: pos.persnum_person_text,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
      actor,
    };
  }

  /**
   * Get list of possible recipients (atasan) for konsep
   * Returns managerial positions that are above the given position
   */
  private getAtasanList(barisData: PositionData[], fromPosition: number): PositionData[] {
    const from = this.findByPosition(barisData, fromPosition);
    if (!from) return [];

    // Filter: chief=1 (managerial) dan level lebih tinggi (angka lebih kecil)
    // atau organization_parent match
    return barisData.filter((pos) => {
      // Must be managerial
      if (pos.chief !== 1) return false;
      
      // Cannot be self
      if (pos.position === fromPosition) return false;

      // Must be at higher level OR same org parent chain
      if (pos.level < from.level) return true;
      if (from.organization_parent === pos.organization_id) return true;

      return false;
    }).sort((a, b) => a.level - b.level); // Sort by level (highest first)
  }

  /**
   * Validate hierarchy: to_position must be atasan (direct or indirect) of from_position
   * For konsep: konseptor (bawahan) → pemeriksa/pengirim (atasan)
   */
  private validateHierarchy(barisData: PositionData[], fromPosition: number, toPosition: number): boolean {
    const from = this.findByPosition(barisData, fromPosition);
    const to = this.findByPosition(barisData, toPosition);

    if (!from || !to) return false;

    // To must be at a higher level (lower number) than from
    // OR same organization parent chain
    if (to.level < from.level) {
      return true; // To is above From in hierarchy
    }

    // Check if same organization chain
    if (from.organization_parent === to.organization_id) {
      return true; // To is direct parent org
    }

    return false;
  }

  /**
   * Create sirkulasi from PositionData
   */
  private createSirkulasiFromPosition(
    idNaskah: string,
    sirkuler: 'pengirim' | 'penerima' | 'tembusan',
    pos: PositionData,
    isDraft: boolean = true,
  ): NaskahSirkulasi {
    return this.naskahSirkulasiRepository.create({
      id: uuidv4(),
      idNaskah,
      sirkuler,
      company: String(COMPANY_ID),
      companyText: 'PERUM LPPNPI',
      area: pos.area ?? '',
      areaText: pos.area_text ?? '',
      subArea: String(pos.sub_area ?? ''),
      subAreaText: pos.sub_area_text ?? '',
      organization: String(pos.organization_id),
      organizationText: pos.organization_text,
      position: String(pos.position),
      positionText: pos.position_text,
      positionStatus: 'ybs',
      idSirkuler: String(pos.persnum_person ?? pos.position ?? ''),
      namaSirkuler: pos.persnum_person_text ?? pos.position_text ?? '',
      isDraft,
    });
  }

  // ============================================================
  // GET RECIPIENT (ATASAN)
  // ============================================================

  /**
   * Get list of possible recipients (atasan) for konsep
   * Format response sama seperti ND get-recipient
   * 
   * @param positionId Position ID pembuat konsep
   * @returns Sender info dan list of managerial positions (ATASAN only)
   */
  async getRecipient(positionId: number): Promise<KonsepRecipientResponse> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const barisData = await this.getPositionData(dateStr);

    const sender = this.findByPosition(barisData, positionId);
    if (!sender) {
      throw new NotFoundException(`Position ${positionId} tidak ditemukan di org_data`);
    }

    const atasanList = this.getAtasanList(barisData, positionId);

    return {
      sender,
      recipients: {
        ATASAN: atasanList,
      },
    };
  }

  // ============================================================
  // CREATE KONSEP
  // ============================================================

  /**
   * Create konsep naskah
   * 
   * Flow:
   * 1. Validate from_position (konseptor) dan to_position (pemeriksa/pengirim)
   * 2. Validate hierarchy (konseptor harus bawahan dari pemeriksa/pengirim)
   * 3. Create naskah dengan status 'draf'
   * 4. Create naskah_sirkulasi (pengirim = konseptor, untuk tracking)
   * 5. Create nd/sdi_sde sesuai jenis
   * 6. Create konsep record untuk workflow
   * 7. Create lampiran (jika ada)
   */
  async createKonsep(dto: CreateKonsepDto): Promise<CreateKonsepResponseDto> {
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];
    const barisData = await this.getPositionData(tanggal);

    // PHASE 1: Validate from (konseptor)
    const fromPos = this.findByPosition(barisData, dto.from_position_id);
    if (!fromPos) {
      throw new NotFoundException(`Konseptor dengan position_id ${dto.from_position_id} tidak ditemukan`);
    }

    // PHASE 2: Validate to (pemeriksa/pengirim)
    const toPos = this.findByPosition(barisData, dto.to_position_id);
    if (!toPos) {
      throw new NotFoundException(`Pemeriksa/Pengirim dengan position_id ${dto.to_position_id} tidak ditemukan`);
    }

    // Check to_position must be managerial (chief=1)
    if (toPos.chief !== 1) {
      throw new ForbiddenException(
        `Position ${dto.to_position_id} bukan managerial. Konsep hanya bisa dikirim ke atasan managerial.`,
      );
    }

    // PHASE 3: Validate hierarchy
    if (!this.validateHierarchy(barisData, dto.from_position_id, dto.to_position_id)) {
      throw new BadRequestException(
        `Position ${dto.to_position_id} bukan atasan dari position ${dto.from_position_id}. Konsep harus dikirim ke atasan.`,
      );
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 4: Create naskah with status 'final' or 'final_tte'
      const naskahId = uuidv4();
      const tanggalHariIni = new Date();
      const naskahStatus = dto.tanda_tangan ? 'final_tte' : 'final';

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: dto.jenis,
        klasifikasi: dto.klasifikasi ?? undefined,
        klasifikasi_text: dto.klasifikasi_text ?? undefined,
        sifat: dto.sifat ?? 'biasa',
        nomor: `KONSEP-${Date.now()}`, // Temporary nomor untuk konsep
        tanggal: tanggalHariIni,
        lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : undefined,
        perihal: dto.perihal ?? undefined,
        konten: dto.konten ?? undefined,
        tempat: dto.nama_tempat ?? fromPos.sub_area_text ?? 'Tangerang',
        status: naskahStatus,
      });
      await queryRunner.manager.save(naskah);

      // PHASE 5: Create naskah_sirkulasi - pembuat sebagai pengirim
      const pengirimSirkulasi = this.createSirkulasiFromPosition(naskahId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 5.1: Create naskah_sirkulasi - atasan sebagai penerima
      const penerimaSirkulasi = this.createSirkulasiFromPosition(naskahId, 'penerima', toPos, false);
      await queryRunner.manager.save(penerimaSirkulasi);

      // PHASE 6: Create nd/sdi_sde sesuai jenis
      if (dto.jenis === 'ND') {
        const ndEntity = this.ndRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
          kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
          alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
          nomor: naskah.nomor,
          kepadaYth: dto.kepada_yth ?? null,
          dari: dto.dari ?? `${fromPos.position_text} - ${fromPos.organization_text}`,
          perihal: dto.perihal ?? null,
          konten: dto.konten ?? null,
          namaTempat: dto.nama_tempat ?? fromPos.sub_area_text ?? 'Tangerang',
          tanggal: tanggalHariIni,
          namaJabatan: dto.nama_jabatan ?? toPos.position_text,
          tandaTangan: dto.tanda_tangan ?? null,
          namaLengkap: dto.nama_lengkap ?? toPos.persnum_person_text,
          tembusan: dto.tembusan ?? null,
        });
        await queryRunner.manager.save(ndEntity);
      } else if (dto.jenis === 'SDI' || dto.jenis === 'SDE') {
        const sdiSdeEntity = this.sdiSdeRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
          kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
          alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
          namaTempat: dto.nama_tempat ?? fromPos.sub_area_text ?? 'Tangerang',
          tanggal: tanggalHariIni,
          nomor: naskah.nomor,
          sifat: dto.sifat ?? 'biasa',
          lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : null,
          perihal: dto.perihal ?? null,
          kepadaYth: dto.kepada_yth ?? null,
          nama: dto.nama_lengkap ?? null,
          alamat: dto.alamat ?? null,
          konten: dto.konten ?? null,
          namaJabatan: dto.nama_jabatan ?? toPos.position_text,
          tandaTangan: dto.tanda_tangan ?? null,
          namaLengkap: dto.nama_lengkap ?? toPos.persnum_person_text,
          tembusan: dto.tembusan ?? null,
        });
        await queryRunner.manager.save(sdiSdeEntity);
      }

      // PHASE 7: Create konsep record
      const konsepId = uuidv4();
      const konsep = this.konsepRepository.create({
        id: konsepId,
        company: String(COMPANY_ID),
        idNaskah: naskahId,
        jenis: dto.jenis,

        // FROM (Pembuat konsep)
        fromArea: fromPos.area ?? null,
        fromAreaText: fromPos.area_text ?? null,
        fromSubArea: String(fromPos.sub_area ?? ''),
        fromSubAreaText: fromPos.sub_area_text ?? null,
        fromOrganization: String(fromPos.organization_id),
        fromOrganizationText: fromPos.organization_text,
        fromPosition: String(fromPos.position),
        fromPositionText: fromPos.position_text,
        fromPositionStatus: 'ybs',
        fromIdSirkuler: String(fromPos.persnum_person ?? fromPos.position ?? ''),
        fromNamaSirkuler: fromPos.persnum_person_text ?? fromPos.position_text ?? '',
        fromActor: 'pembuat',

        // TO (Penerima / Atasan)
        toArea: toPos.area ?? null,
        toAreaText: toPos.area_text ?? null,
        toSubArea: String(toPos.sub_area ?? ''),
        toSubAreaText: toPos.sub_area_text ?? null,
        toOrganization: String(toPos.organization_id),
        toOrganizationText: toPos.organization_text,
        toPosition: String(toPos.position),
        toPositionText: toPos.position_text,
        toPositionStatus: 'ybs',
        toIdSirkuler: String(toPos.persnum_person ?? toPos.position ?? ''),
        toNamaSirkuler: toPos.persnum_person_text ?? toPos.position_text ?? '',
        toActor: 'penerima',

        catatan: dto.catatan ?? null,
        sendReadTime: null,
        sendReadUser: null,

        // Data surat final (untuk sirkulasi setelah finalize)
        pengirimPositionId: dto.from_position_id ? String(dto.from_position_id) : null,
        penerimaPositionIds: dto.penerima_position_ids ? JSON.stringify(dto.penerima_position_ids) : null,
        tembusanPositionIds: dto.tembusan_position_ids ? JSON.stringify(dto.tembusan_position_ids) : null,
      });
      await queryRunner.manager.save(konsep);

      // PHASE 8: Handle lampiran
      // Priority: lampiran_temp_ids (recommended) > lampiran (deprecated)
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        // Convert temporary lampiran to permanent
        await this.handleLampiranTempIds(naskahId, dto.lampiran_temp_ids, dto.jenis);
      } else if (dto.lampiran && dto.lampiran.length > 0) {
        // Legacy: Create lampiran from DTO (deprecated)
        for (const lamp of dto.lampiran) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: dto.jenis,
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // Commit
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil dibuat',
        data: {
          id_konsep: konsepId,
          id_naskah: naskahId,
          jenis: dto.jenis,
          from: this.toPositionInfo(fromPos, 'pembuat'),
          to: this.toPositionInfo(toPos, 'penerima'),
          status: naskahStatus,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // GET INBOX KONSEP
  // ============================================================

  /**
   * Get inbox konsep untuk pemeriksa/pengirim
   * 
   * Query konsep dimana to_position = positionId
   */
  async getInbox(positionId: number): Promise<KonsepInboxResponseDto> {
    const konsepList = await this.konsepRepository.find({
      where: { toPosition: String(positionId) },
      order: { createAt: 'DESC' },
    });

    const items: KonsepListItemDto[] = konsepList.map((k) => ({
      id: k.id,
      id_naskah: k.idNaskah,
      jenis: k.jenis,
      from_position_id: k.fromPosition ?? '',
      from_position_text: k.fromPositionText ?? '',
      from_nama: k.fromNamaSirkuler,
      from_actor: k.fromActor,
      to_position_id: k.toPosition ?? '',
      to_position_text: k.toPositionText ?? '',
      to_nama: k.toNamaSirkuler,
      to_actor: k.toActor,
      perihal: null, // Need to join with naskah
      status: null,
      catatan: k.catatan,
      send_read_time: k.sendReadTime,
      is_read: k.sendReadTime !== null,
      create_at: k.createAt,
    }));

    // Enrich with naskah data
    for (const item of items) {
      if (item.id_naskah) {
        const naskah = await this.naskahRepository.findOne({ where: { id: item.id_naskah } });
        if (naskah) {
          item.perihal = naskah.perihal;
          item.status = naskah.status;
        }
      }
    }

    return {
      success: true,
      message: 'Berhasil mendapatkan inbox konsep',
      total: items.length,
      data: items,
    };
  }

  // ============================================================
  // GET SENT KONSEP
  // ============================================================

  /**
   * Get sent konsep dari konseptor/pemeriksa
   * 
   * Query konsep dimana from_position = positionId
   */
  async getSent(positionId: number): Promise<KonsepSentResponseDto> {
    const konsepList = await this.konsepRepository.find({
      where: { fromPosition: String(positionId) },
      order: { createAt: 'DESC' },
    });

    const items: KonsepListItemDto[] = konsepList.map((k) => ({
      id: k.id,
      id_naskah: k.idNaskah,
      jenis: k.jenis,
      from_position_id: k.fromPosition ?? '',
      from_position_text: k.fromPositionText ?? '',
      from_nama: k.fromNamaSirkuler,
      from_actor: k.fromActor,
      to_position_id: k.toPosition ?? '',
      to_position_text: k.toPositionText ?? '',
      to_nama: k.toNamaSirkuler,
      to_actor: k.toActor,
      perihal: null,
      status: null,
      catatan: k.catatan,
      send_read_time: k.sendReadTime,
      is_read: k.sendReadTime !== null,
      create_at: k.createAt,
    }));

    // Enrich with naskah data
    for (const item of items) {
      if (item.id_naskah) {
        const naskah = await this.naskahRepository.findOne({ where: { id: item.id_naskah } });
        if (naskah) {
          item.perihal = naskah.perihal;
          item.status = naskah.status;
        }
      }
    }

    return {
      success: true,
      message: 'Berhasil mendapatkan konsep yang dikirim',
      total: items.length,
      data: items,
    };
  }

  // ============================================================
  // FORWARD KONSEP
  // ============================================================

  /**
   * Forward konsep ke atasan berikutnya
   * 
   * Penerima konsep bisa meneruskan ke atasannya lagi
   * - Tidak membuat naskah baru, tetap menggunakan naskah yang sama
   * - Membuat record konsep baru (from: penerima saat ini, to: atasan berikutnya)
   * - Menambah sirkulasi baru
   */
  async forwardKonsep(
    konsepId: string,
    dto: ForwardKonsepDto,
  ): Promise<ForwardKonsepResponseDto> {
    // PHASE 1: Validate konsep exists
    const originalKonsep = await this.konsepRepository.findOne({ where: { id: konsepId } });
    if (!originalKonsep) {
      throw new NotFoundException(`Konsep dengan ID ${konsepId} tidak ditemukan`);
    }

    // Check if user is the recipient of this konsep
    if (originalKonsep.toPosition !== String(dto.from_position_id)) {
      throw new ForbiddenException(
        `Position ${dto.from_position_id} bukan penerima konsep ini. Hanya penerima yang bisa forward.`,
      );
    }

    // PHASE 2: Validate positions from org_data
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const barisData = await this.getPositionData(dateStr);

    const fromPos = this.findByPosition(barisData, dto.from_position_id);
    if (!fromPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan di org_data`);
    }

    const toPos = this.findByPosition(barisData, dto.to_position_id);
    if (!toPos) {
      throw new NotFoundException(`Position ${dto.to_position_id} tidak ditemukan di org_data`);
    }

    // Check to_position must be managerial (chief=1) - atasan
    if (toPos.chief !== 1) {
      throw new ForbiddenException(
        `Position ${dto.to_position_id} bukan managerial. Konsep hanya bisa diteruskan ke atasan.`,
      );
    }

    // Validate hierarchy: to must be above from
    if (!this.validateHierarchy(barisData, dto.from_position_id, dto.to_position_id)) {
      throw new BadRequestException(
        `Position ${dto.to_position_id} bukan atasan dari position ${dto.from_position_id}.`,
      );
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const naskahId = originalKonsep.idNaskah!;

      // PHASE 3: Update naskah jika ada perubahan
      const naskah = await this.naskahRepository.findOne({ where: { id: naskahId } });
      if (naskah) {
        if (dto.perihal !== undefined) naskah.perihal = dto.perihal;
        if (dto.konten !== undefined) naskah.konten = dto.konten;
        if (dto.klasifikasi !== undefined) naskah.klasifikasi = dto.klasifikasi;
        if (dto.klasifikasi_text !== undefined) naskah.klasifikasi_text = dto.klasifikasi_text;
        if (dto.sifat !== undefined) naskah.sifat = dto.sifat;
        if (dto.lampiran !== undefined) naskah.lampiran = dto.lampiran.length ? `${dto.lampiran.length} file` : '';
        if (dto.tanda_tangan) naskah.status = 'final_tte';
        await queryRunner.manager.save(naskah);
      }

      // PHASE 4: Update nd/sdi_sde jika ada perubahan
      if (originalKonsep.jenis === 'ND') {
        const nd = await this.ndRepository.findOne({ where: { idNaskah: naskahId } });
        if (nd) {
          if (dto.kop_logo !== undefined) nd.kopLogo = dto.kop_logo;
          if (dto.kop_nama !== undefined) nd.kopNama = dto.kop_nama;
          if (dto.alamat_perusahaan !== undefined) nd.alamatPerusahaan = dto.alamat_perusahaan;
          if (dto.kepada_yth !== undefined) nd.kepadaYth = dto.kepada_yth;
          if (dto.dari !== undefined) nd.dari = dto.dari;
          if (dto.perihal !== undefined) nd.perihal = dto.perihal;
          if (dto.konten !== undefined) nd.konten = dto.konten;
          if (dto.nama_tempat !== undefined) nd.namaTempat = dto.nama_tempat;
          if (dto.nama_jabatan !== undefined) nd.namaJabatan = dto.nama_jabatan;
          if (dto.tanda_tangan !== undefined) nd.tandaTangan = dto.tanda_tangan;
          if (dto.nama_lengkap !== undefined) nd.namaLengkap = dto.nama_lengkap;
          if (dto.tembusan !== undefined) nd.tembusan = dto.tembusan;
          await queryRunner.manager.save(nd);
        }
      } else if (originalKonsep.jenis === 'SDI' || originalKonsep.jenis === 'SDE') {
        const sdiSde = await this.sdiSdeRepository.findOne({ where: { idNaskah: naskahId } });
        if (sdiSde) {
          if (dto.kop_logo !== undefined) sdiSde.kopLogo = dto.kop_logo;
          if (dto.kop_nama !== undefined) sdiSde.kopNama = dto.kop_nama;
          if (dto.alamat_perusahaan !== undefined) sdiSde.alamatPerusahaan = dto.alamat_perusahaan;
          if (dto.nama_tempat !== undefined) sdiSde.namaTempat = dto.nama_tempat;
          if (dto.sifat !== undefined) sdiSde.sifat = dto.sifat;
          if (dto.lampiran !== undefined) sdiSde.lampiran = dto.lampiran.length ? `${dto.lampiran.length} file` : null;
          if (dto.perihal !== undefined) sdiSde.perihal = dto.perihal;
          if (dto.kepada_yth !== undefined) sdiSde.kepadaYth = dto.kepada_yth;
          if (dto.nama_lengkap !== undefined) sdiSde.nama = dto.nama_lengkap;
          if (dto.alamat !== undefined) sdiSde.alamat = dto.alamat;
          if (dto.konten !== undefined) sdiSde.konten = dto.konten;
          if (dto.nama_jabatan !== undefined) sdiSde.namaJabatan = dto.nama_jabatan;
          if (dto.tanda_tangan !== undefined) sdiSde.tandaTangan = dto.tanda_tangan;
          if (dto.tembusan !== undefined) sdiSde.tembusan = dto.tembusan;
          await queryRunner.manager.save(sdiSde);
        }
      }

      // PHASE 5: Handle lampiran updates
      // Priority: lampiran_temp_ids > lampiran (deprecated) > no changes
      if (dto.lampiran_temp_ids !== undefined && dto.lampiran_temp_ids.length > 0) {
        // Delete old lampiran
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });
        // Convert temporary lampiran to permanent
        await this.handleLampiranTempIds(naskahId, dto.lampiran_temp_ids, originalKonsep.jenis ?? 'ND');
      } else if (dto.lampiran !== undefined) {
        // Legacy: Update lampiran from DTO (deprecated)
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });
        for (const lamp of dto.lampiran) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: originalKonsep.jenis ?? 'ND',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 6: Create naskah_sirkulasi for forwarder (pengirim)
      const forwarderSirkulasi = this.createSirkulasiFromPosition(naskahId, 'pengirim', fromPos, false);
      await queryRunner.manager.save(forwarderSirkulasi);

      // PHASE 6.1: Create naskah_sirkulasi for new recipient (penerima)
      const penerimaSirkulasi = this.createSirkulasiFromPosition(naskahId, 'penerima', toPos, false);
      await queryRunner.manager.save(penerimaSirkulasi);

      // PHASE 7: Create new konsep record
      const newKonsepId = uuidv4();
      const newKonsep = this.konsepRepository.create({
        id: newKonsepId,
        company: String(COMPANY_ID),
        idNaskah: naskahId,
        jenis: originalKonsep.jenis,

        // FROM (Penerus - yang forward)
        fromArea: fromPos.area ?? null,
        fromAreaText: fromPos.area_text ?? null,
        fromSubArea: String(fromPos.sub_area ?? ''),
        fromSubAreaText: fromPos.sub_area_text ?? null,
        fromOrganization: String(fromPos.organization_id),
        fromOrganizationText: fromPos.organization_text,
        fromPosition: String(fromPos.position),
        fromPositionText: fromPos.position_text,
        fromPositionStatus: 'ybs',
        fromIdSirkuler: String(fromPos.persnum_person ?? fromPos.position ?? ''),
        fromNamaSirkuler: fromPos.persnum_person_text ?? fromPos.position_text ?? '',
        fromActor: 'penerus',

        // TO (Penerima baru - atasan berikutnya)
        toArea: toPos.area ?? null,
        toAreaText: toPos.area_text ?? null,
        toSubArea: String(toPos.sub_area ?? ''),
        toSubAreaText: toPos.sub_area_text ?? null,
        toOrganization: String(toPos.organization_id),
        toOrganizationText: toPos.organization_text,
        toPosition: String(toPos.position),
        toPositionText: toPos.position_text,
        toPositionStatus: 'ybs',
        toIdSirkuler: String(toPos.persnum_person ?? toPos.position ?? ''),
        toNamaSirkuler: toPos.persnum_person_text ?? toPos.position_text ?? '',
        toActor: 'penerima',

        catatan: dto.catatan ?? null,
        sendReadTime: null,
        sendReadUser: null,

        // Copy atau update data surat final dari konsep sebelumnya
        pengirimPositionId: originalKonsep.pengirimPositionId,
        penerimaPositionIds: dto.penerima_position_ids ? JSON.stringify(dto.penerima_position_ids) : originalKonsep.penerimaPositionIds,
        tembusanPositionIds: dto.tembusan_position_ids ? JSON.stringify(dto.tembusan_position_ids) : originalKonsep.tembusanPositionIds,
      });
      await queryRunner.manager.save(newKonsep);

      // Commit
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil diteruskan ke atasan',
        data: {
          id_konsep: newKonsepId,
          id_naskah: naskahId,
          jenis: originalKonsep.jenis!,
          from: this.toPositionInfo(fromPos, 'penerus'),
          to: this.toPositionInfo(toPos, 'penerima'),
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // REVIEW KONSEP
  // ============================================================

  /**
   * Review konsep oleh pemeriksa
   * 
   * Actions:
   * - approve: Lanjutkan ke pemeriksa/pengirim berikutnya atau finalize
   * - revisi: Kembalikan ke konseptor dengan catatan
   * - reject: Tolak konsep
   */
  async reviewKonsep(
    konsepId: string,
    reviewerPositionId: number,
    dto: ReviewKonsepDto,
  ): Promise<ReviewKonsepResponseDto> {
    // Find konsep
    const konsep = await this.konsepRepository.findOne({ where: { id: konsepId } });
    if (!konsep) {
      throw new NotFoundException(`Konsep dengan ID ${konsepId} tidak ditemukan`);
    }

    // Validate reviewer is the to_position
    if (String(konsep.toPosition) !== String(reviewerPositionId)) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk review konsep ini. Konsep ditujukan ke position ${konsep.toPosition}.`,
      );
    }

    // Mark as read
    if (!konsep.sendReadTime) {
      konsep.sendReadTime = new Date();
      konsep.sendReadUser = String(reviewerPositionId);
      await this.konsepRepository.save(konsep);
    }

    const action = dto.action ?? 'approve';

    // Get org data for validation
    const barisData = await this.getPositionData();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (action === 'approve') {
        // If forward_to_position_id is provided, forward to next reviewer
        if (dto.forward_to_position_id) {
          const nextPos = this.findByPosition(barisData, dto.forward_to_position_id);
          if (!nextPos) {
            throw new NotFoundException(`Position ${dto.forward_to_position_id} tidak ditemukan`);
          }

          // Create new konsep record for next reviewer
          const currentReviewerPos = this.findByPosition(barisData, reviewerPositionId);
          if (!currentReviewerPos) {
            throw new NotFoundException(`Position ${reviewerPositionId} tidak ditemukan`);
          }

          const newKonsepId = uuidv4();
          const newKonsep = this.konsepRepository.create({
            id: newKonsepId,
            company: konsep.company,
            idNaskah: konsep.idNaskah,
            jenis: konsep.jenis,

            // FROM = current reviewer (pemeriksa)
            fromArea: currentReviewerPos.area ?? null,
            fromAreaText: currentReviewerPos.area_text ?? null,
            fromSubArea: String(currentReviewerPos.sub_area ?? ''),
            fromSubAreaText: currentReviewerPos.sub_area_text ?? null,
            fromOrganization: String(currentReviewerPos.organization_id),
            fromOrganizationText: currentReviewerPos.organization_text,
            fromPosition: String(currentReviewerPos.position),
            fromPositionText: currentReviewerPos.position_text,
            fromPositionStatus: 'ybs',
            fromIdSirkuler: String(currentReviewerPos.persnum_person ?? currentReviewerPos.position ?? ''),
            fromNamaSirkuler: currentReviewerPos.persnum_person_text ?? currentReviewerPos.position_text ?? '',
            fromActor: 'pemeriksa',

            // TO = next reviewer
            toArea: nextPos.area ?? null,
            toAreaText: nextPos.area_text ?? null,
            toSubArea: String(nextPos.sub_area ?? ''),
            toSubAreaText: nextPos.sub_area_text ?? null,
            toOrganization: String(nextPos.organization_id),
            toOrganizationText: nextPos.organization_text,
            toPosition: String(nextPos.position),
            toPositionText: nextPos.position_text,
            toPositionStatus: 'ybs',
            toIdSirkuler: String(nextPos.persnum_person ?? nextPos.position ?? ''),
            toNamaSirkuler: nextPos.persnum_person_text ?? nextPos.position_text ?? '',
            toActor: dto.forward_to_actor ?? 'pemeriksa',

            catatan: dto.catatan ?? null,
          });
          await queryRunner.manager.save(newKonsep);

          await queryRunner.commitTransaction();

          return {
            success: true,
            message: 'Konsep berhasil di-forward ke pemeriksa berikutnya',
            data: {
              id_konsep: newKonsepId,
              action: 'approve',
              forward_to: this.toPositionInfo(nextPos, dto.forward_to_actor ?? 'pemeriksa'),
              status: 'draf',
            },
          };
        }

        // No forward, just approve
        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Konsep berhasil disetujui',
          data: {
            id_konsep: konsepId,
            action: 'approve',
            status: 'draf',
          },
        };
      } else if (action === 'revisi') {
        // Update catatan
        if (dto.catatan) {
          konsep.catatan = dto.catatan;
          await queryRunner.manager.save(konsep);
        }

        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Konsep dikembalikan untuk revisi',
          data: {
            id_konsep: konsepId,
            action: 'revisi',
            status: 'draf',
          },
        };
      } else if (action === 'reject') {
        // Update naskah status? Or just mark konsep as rejected?
        if (dto.catatan) {
          konsep.catatan = dto.catatan;
        }
        konsep.flagArsip = 1; // Mark as archived/rejected
        await queryRunner.manager.save(konsep);

        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Konsep ditolak',
          data: {
            id_konsep: konsepId,
            action: 'reject',
            status: 'rejected',
          },
        };
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Review konsep berhasil',
        data: {
          id_konsep: konsepId,
          action: action,
          status: 'draf',
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // FINALIZE KONSEP
  // ============================================================

  /**
   * Finalize konsep oleh pengirim/penandatangan
   * 
   * Flow:
   * 1. Validate pengirim is the recipient of konsep
   * 2. Generate nomor surat resmi
   * 3. Update naskah, nd/sdi_sde dengan data final
   * 4. Create naskah_sirkulasi for penerima & tembusan
   * 5. Update status to 'final' or 'final_tte'
   */
  async finalizeKonsep(
    konsepId: string,
    dto: FinalizeKonsepDto,
  ): Promise<FinalizeKonsepResponseDto> {
    // Find konsep
    const konsep = await this.konsepRepository.findOne({ where: { id: konsepId } });
    if (!konsep) {
      throw new NotFoundException(`Konsep dengan ID ${konsepId} tidak ditemukan`);
    }

    // Validate pengirim is the recipient
    if (String(konsep.toPosition) !== String(dto.from_position_id)) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk finalize konsep ini. Konsep ditujukan ke position ${konsep.toPosition}.`,
      );
    }

    // Get naskah
    const naskah = await this.naskahRepository.findOne({ where: { id: konsep.idNaskah ?? '' } });
    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${konsep.idNaskah} tidak ditemukan`);
    }

    const barisData = await this.getPositionData();
    const pengirimPos = this.findByPosition(barisData, dto.from_position_id);
    if (!pengirimPos) {
      throw new NotFoundException(`Position ${dto.from_position_id} tidak ditemukan`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Generate nomor surat resmi
      const nomorSurat = await this.generateNomorSurat(
        konsep.jenis ?? 'ND',
        dto.klasifikasi ?? naskah.klasifikasi ?? 'UMUM',
        pengirimPos.sub_area ?? 0,
      );

      // Determine status
      const status = dto.tanda_tangan ? 'final_tte' : 'final';

      // Update naskah dengan semua field yang mungkin diubah
      naskah.nomor = nomorSurat;
      naskah.status = status;
      if (dto.perihal !== undefined) naskah.perihal = dto.perihal;
      if (dto.konten !== undefined) naskah.konten = dto.konten;
      if (dto.klasifikasi !== undefined) naskah.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskah.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskah.sifat = dto.sifat;
      if (dto.lampiran !== undefined) naskah.lampiran = dto.lampiran.length ? `${dto.lampiran.length} file` : '';
      await queryRunner.manager.save(naskah);

      // Update nd/sdi_sde dengan semua field
      if (konsep.jenis === 'ND') {
        const nd = await this.ndRepository.findOne({ where: { idNaskah: naskah.id } });
        if (nd) {
          nd.nomor = nomorSurat;
          if (dto.kop_logo !== undefined) nd.kopLogo = dto.kop_logo;
          if (dto.kop_nama !== undefined) nd.kopNama = dto.kop_nama;
          if (dto.alamat_perusahaan !== undefined) nd.alamatPerusahaan = dto.alamat_perusahaan;
          if (dto.kepada_yth !== undefined) nd.kepadaYth = dto.kepada_yth;
          if (dto.dari !== undefined) nd.dari = dto.dari;
          if (dto.perihal !== undefined) nd.perihal = dto.perihal;
          if (dto.konten !== undefined) nd.konten = dto.konten;
          if (dto.nama_tempat !== undefined) nd.namaTempat = dto.nama_tempat;
          if (dto.nama_jabatan !== undefined) nd.namaJabatan = dto.nama_jabatan;
          if (dto.tanda_tangan !== undefined) nd.tandaTangan = dto.tanda_tangan;
          if (dto.nama_lengkap !== undefined) nd.namaLengkap = dto.nama_lengkap;
          if (dto.tembusan !== undefined) nd.tembusan = dto.tembusan;
          await queryRunner.manager.save(nd);
        }
      } else if (konsep.jenis === 'SDI' || konsep.jenis === 'SDE') {
        const sdiSde = await this.sdiSdeRepository.findOne({ where: { idNaskah: naskah.id } });
        if (sdiSde) {
          sdiSde.nomor = nomorSurat;
          if (dto.kop_logo !== undefined) sdiSde.kopLogo = dto.kop_logo;
          if (dto.kop_nama !== undefined) sdiSde.kopNama = dto.kop_nama;
          if (dto.alamat_perusahaan !== undefined) sdiSde.alamatPerusahaan = dto.alamat_perusahaan;
          if (dto.nama_tempat !== undefined) sdiSde.namaTempat = dto.nama_tempat;
          if (dto.sifat !== undefined) sdiSde.sifat = dto.sifat;
          if (dto.lampiran !== undefined) sdiSde.lampiran = dto.lampiran.length ? `${dto.lampiran.length} file` : null;
          if (dto.perihal !== undefined) sdiSde.perihal = dto.perihal;
          if (dto.kepada_yth !== undefined) sdiSde.kepadaYth = dto.kepada_yth;
          if (dto.nama_lengkap !== undefined) sdiSde.nama = dto.nama_lengkap;
          if (dto.alamat !== undefined) sdiSde.alamat = dto.alamat;
          if (dto.konten !== undefined) sdiSde.konten = dto.konten;
          if (dto.nama_jabatan !== undefined) sdiSde.namaJabatan = dto.nama_jabatan;
          if (dto.tanda_tangan !== undefined) sdiSde.tandaTangan = dto.tanda_tangan;
          if (dto.tembusan !== undefined) sdiSde.tembusan = dto.tembusan;
          await queryRunner.manager.save(sdiSde);
        }
      }

      // Handle lampiran updates
      // Priority: lampiran_temp_ids > lampiran (deprecated) > no changes
      if (dto.lampiran_temp_ids !== undefined && dto.lampiran_temp_ids.length > 0) {
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskah.id });
        // Convert temporary lampiran to permanent
        await this.handleLampiranTempIds(naskah.id, dto.lampiran_temp_ids, konsep.jenis ?? 'ND');
      } else if (dto.lampiran !== undefined) {
        // Legacy: Update lampiran from DTO (deprecated)
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskah.id });
        for (const lamp of dto.lampiran) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskah.id,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: konsep.jenis ?? 'ND',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // Create sirkulasi untuk pengirim (penandatangan)
      const pengirimSirkulasi = this.createSirkulasiFromPosition(naskah.id, 'pengirim', pengirimPos, false);
      await queryRunner.manager.save(pengirimSirkulasi);

      // Create penerima sirkulasi
      const penerimaResponses: Array<{ position_id: number; position_text: string; nama: string | null }> = [];
      // Priority: DTO > konsep stored data
      const penerimaIds = dto.penerima_position_ids || (konsep.penerimaPositionIds ? JSON.parse(konsep.penerimaPositionIds) : []);
      if (penerimaIds && penerimaIds.length > 0) {
        for (const posId of penerimaIds) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;

          const sirkulasi = this.createSirkulasiFromPosition(naskah.id, 'penerima', pos, false);
          await queryRunner.manager.save(sirkulasi);

          penerimaResponses.push({
            position_id: pos.position,
            position_text: pos.position_text,
            nama: pos.persnum_person_text,
          });
        }
      }

      // Create tembusan sirkulasi
      const tembusanResponses: Array<{ position_id: number; position_text: string; nama: string | null }> = [];
      // Priority: DTO > konsep stored data
      const tembusanIds = dto.tembusan_position_ids || (konsep.tembusanPositionIds ? JSON.parse(konsep.tembusanPositionIds) : []);
      if (tembusanIds && tembusanIds.length > 0) {
        for (const posId of tembusanIds) {
          const pos = this.findByPosition(barisData, posId);
          if (!pos) continue;

          const sirkulasi = this.createSirkulasiFromPosition(naskah.id, 'tembusan', pos, false);
          await queryRunner.manager.save(sirkulasi);

          tembusanResponses.push({
            position_id: pos.position,
            position_text: pos.position_text,
            nama: pos.persnum_person_text,
          });
        }
      }

      // Mark konsep as finalized
      konsep.sendReadTime = new Date();
      konsep.sendReadUser = String(dto.from_position_id);
      await queryRunner.manager.save(konsep);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Konsep berhasil difinalisasi dan dikirim',
        data: {
          id_konsep: konsepId,
          id_naskah: naskah.id,
          nomor_surat: nomorSurat,
          status: status as 'final' | 'final_tte',
          penerima: penerimaResponses,
          tembusan: tembusanResponses.length > 0 ? tembusanResponses : undefined,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // HELPER: GENERATE NOMOR SURAT
  // ============================================================

  private async generateNomorSurat(
    jenis: 'ND' | 'SDI' | 'SDE',
    klasifikasi: string,
    subArea: number,
  ): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const romawiMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const bulanRomawi = romawiMonths[month - 1];

    // Count existing naskah for this month
    const count = await this.naskahRepository.count({
      where: { jenis },
    });

    const sequence = String(count + 1).padStart(3, '0');

    // Format: {JENIS}-{sequence}/{klasifikasi}/{sub_area}/{bulan_romawi}/{tahun}
    return `${jenis}-${sequence}/${klasifikasi}/${subArea}/${bulanRomawi}/${year}`;
  }

  // ============================================================
  // MARK AS READ
  // ============================================================

  async markAsRead(konsepId: string, positionId: number): Promise<{ success: boolean; message: string }> {
    const konsep = await this.konsepRepository.findOne({ where: { id: konsepId } });
    if (!konsep) {
      throw new NotFoundException(`Konsep dengan ID ${konsepId} tidak ditemukan`);
    }

    if (String(konsep.toPosition) !== String(positionId)) {
      throw new ForbiddenException(`Anda tidak memiliki akses untuk membaca konsep ini.`);
    }

    if (!konsep.sendReadTime) {
      konsep.sendReadTime = new Date();
      konsep.sendReadUser = String(positionId);
      await this.konsepRepository.save(konsep);
    }

    return {
      success: true,
      message: 'Konsep ditandai sebagai sudah dibaca',
    };
  }

  // ============================================================
  // FORM-DATA PARSING HELPERS
  // ============================================================

  /**
   * Parse form-data to CreateKonsepDto
   */
  async parseFormDataToCreateDto(
    body: any,
    files?: { lampiran_files?: Express.Multer.File[] },
  ): Promise<CreateKonsepDto> {
    // Helper: Parse string array
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

    // Helper: Parse lampiran array
    const parseLampiranArray = (value: any): any[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return [];
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

    // Build DTO
    const dto: CreateKonsepDto = {
      jenis: body.jenis,
      from_position_id: Number(body.from_position_id),
      to_position_id: Number(body.to_position_id),
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
      lampiran: body.lampiran ? parseLampiranArray(body.lampiran) : undefined,
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

    return dto;
  }

  /**
   * Parse form-data to ForwardKonsepDto
   */
  async parseFormDataToForwardDto(
    body: any,
    files?: { lampiran_files?: Express.Multer.File[] },
  ): Promise<ForwardKonsepDto> {
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

    const parseLampiranArray = (value: any): any[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return [];
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

    const dto: ForwardKonsepDto = {
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
      lampiran: body.lampiran ? parseLampiranArray(body.lampiran) : undefined,
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

    return dto;
  }

  /**
   * Parse form-data to FinalizeKonsepDto
   */
  async parseFormDataToFinalizeDto(
    body: any,
    files?: { lampiran_files?: Express.Multer.File[] },
  ): Promise<FinalizeKonsepDto> {
    const parseNumberArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(Number);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(Number) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

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

    const parseLampiranArray = (value: any): any[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return [];
    };

    const dto: FinalizeKonsepDto = {
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
      lampiran: body.lampiran ? parseLampiranArray(body.lampiran) : undefined,
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,
      catatan: body.catatan,
      kepada_yth: body.kepada_yth,
      alamat: body.alamat,
      dari: body.dari,
      tembusan: body.tembusan,
    };

    return dto;
  }

  // ============================================================
  // HELPER: HANDLE TEMPORARY LAMPIRAN
  // ============================================================

  /**
   * Convert temporary lampiran IDs to permanent attachments
   * Attach to naskah and mark as not temporary
   */
  private async handleLampiranTempIds(
    naskahId: string,
    lampiranTempIds: string[],
    jenis: 'ND' | 'SDI' | 'SDE',
  ): Promise<void> {
    if (!lampiranTempIds || lampiranTempIds.length === 0) return;

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
}
