import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual } from 'typeorm';
import { EksternalEntity } from '../entity/eksternal.entity';
import { NaskahEntity } from '../entity/naskah.entity';
import { NaskahSirkulasi } from '../entity/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../entity/naskah_lampiran.entity';
import { SdiSdeEntity } from '../entity/sdi_sde.entity';
import {
  SdeRecipientResponseDto,
  EksternalRecipientDto,
  SdeOrgDataPositionDto,
} from '../dto/surat-dinas-eksternal/sde-recipient-response.dto';
import { CreateSuratDinasEksternalDto, UpdateSdeDraftDto, FinalizeSdeDraftDto } from '../dto/surat-dinas-eksternal/create-surat-dinas-eksternal.dto';
import { SdeSendMessageResponseDto, SdeSirkulasiInfoDto, SdePenerimaInfoDto } from '../dto/surat-dinas-eksternal/send-message-response.dto';
import { OrgDataService } from 'src/org_data/org_data.service';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';

@Injectable()
export class SuratDinasEksternalService {
  constructor(
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(SdiSdeEntity)
    private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
  ) {}

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Helper: Convert SdeOrgDataPositionDto to SdeSirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: SdeOrgDataPositionDto): SdeSirkulasiInfoDto {
    return {
      position: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum,
      nama: pos.nama,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
    };
  }

  /**
   * Helper: Create sirkulasi from SdeOrgDataPositionDto (for pengirim only)
   */
  private createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'pengirim',
    pos: SdeOrgDataPositionDto,
    isDraft: boolean = false,
  ): NaskahSirkulasi {
    const sirkulasi = this.naskahSirkulasiRepository.create({
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
      // Ensure idSirkuler and namaSirkuler are always populated.
      // Prefer persnum/nama, fallback to position/position_text if persnum/nama are missing.
      // Prefer persnum_person/persnum_person_text (if present), then persnum/nama, then fallback to position/position_text
      idSirkuler: String(pos.persnum_person ?? pos.persnum ?? pos.position ?? ''),
      namaSirkuler: pos.persnum_person_text ?? pos.nama ?? pos.position_text ?? '',
      isDraft: isDraft,
    });

    console.log('[SDE createSirkulasiFromOrgData] sirkulasi ->', {
      id: sirkulasi.id,
      position: sirkulasi.position,
      idSirkuler: sirkulasi.idSirkuler,
      namaSirkuler: sirkulasi.namaSirkuler,
      sirkuler: sirkulasi.sirkuler,
      isDraft: sirkulasi.isDraft,
    });

    return sirkulasi;
  }

  /**
   * Helper: Convert EksternalEntity to SdePenerimaInfoDto
   */
  private toEksternalPenerimaInfo(ext: EksternalEntity): SdePenerimaInfoDto {
    return {
      id: ext.id,
      nama: ext.nama,
      alamat: ext.alamat || '',
      telepon: ext.telepon || '',
      email: ext.email || '',
      kontak: ext.kontak || '',
    };
  }

  // ============================================================
  // NOMOR SURAT GENERATION
  // ============================================================

  /**
   * Generate nomor surat SDE
   * Format: SDE-{sequence}/{klasifikasi}/{sub_area_code}/{bulan_romawi}/{tahun}
   */
  async generateNomorSurat(klasifikasi: string, subArea: number): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Bulan romawi
    const romawiMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const bulanRomawi = romawiMonths[month - 1];

    // Get sequence untuk bulan ini
    const endOfMonth = new Date(year, month, 0);

    const count = await this.naskahRepository.count({
      where: {
        jenis: 'SDE',
        tanggal: LessThanOrEqual(endOfMonth),
      },
    });

    const sequence = String(count + 1).padStart(3, '0');

    // Format: SDE-001/HR.01/10020001/XI/2025
    return `SDE-${sequence}/${klasifikasi}/${subArea}/${bulanRomawi}/${year}`;
  }

  // ============================================================
  // GET RECIPIENT - Using org_data (cached)
  // ============================================================

  /**
   * Get all external recipients (aktif only)
   * Dari tabel eksternal, tidak perlu hierarchy
   */
  private async getExternalRecipients(): Promise<EksternalRecipientDto[]> {
    const externals = await this.eksternalRepository.find({
      where: {
        aktif: true,
      },
      order: {
        nama: 'ASC',
      },
    });

    return externals.map((ext) => ({
      id: ext.id,
      nama: ext.nama,
      alamat: ext.alamat || '',
      telepon: ext.telepon || '',
      email: ext.email || '',
      kontak: ext.kontak || '',
    }));
  }

  /**
   * Get SDE recipients using org_data
   * 
   * SDE (Surat Dinas Eksternal):
   * - Pengirim: dari org_data (positionId), harus managerial (chief=1)
   * - Penerima: dari tabel eksternal (pihak luar perusahaan)
   * 
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date for org_data lookup (default: today)
   */
  async getSdeRecipients(
    positionId: number,
    tgl?: string,
  ): Promise<SdeRecipientResponseDto> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    console.log(`[getSdeRecipients] Looking for positionId: ${positionId}, tanggal: ${tanggal}`);

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    console.log(`[getSdeRecipients] Total positions in org_data: ${barisData.length}`);

    // Find sender's position data
    const sender = barisData.find((x) => Number(x.position) === Number(positionId));

    if (!sender) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`,
      );
    }

    console.log(`[getSdeRecipients] Found sender:`, sender.position_text);

    // Verify sender is chief (managerial)
    if (sender.chief !== 1) {
      throw new ForbiddenException(
        `Position ${positionId} bukan managerial (chief). Hanya managerial yang dapat mengirim Surat Dinas Eksternal.`,
      );
    }

    // Get external recipients from tabel eksternal
    const recipients = await this.getExternalRecipients();

    return {
      sender,
      recipients,
      totalRecipients: recipients.length,
    };
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  /**
   * Private method: Core logic untuk create SDE
   * Digunakan oleh saveDraft dan sendMessage
   */
  private async createSde(
    dto: CreateSuratDinasEksternalDto,
    status: 'draf' | 'final' | 'final_tte',
  ): Promise<SdeSendMessageResponseDto> {
    // Use provided date or today
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 1: Get org_data untuk validasi pengirim
    const orgData = await this.orgDataService.findOrg(tanggal);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // PHASE 2: Validate pengirim from org_data
    const pengirim = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
    if (!pengirim) {
      throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
    }
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`);
    }

    // PHASE 3: Validate penerima dari tabel eksternal
    const penerimaList: EksternalEntity[] = [];
    for (const eksternalId of dto.penerima) {
      const eksternal = await this.eksternalRepository.findOne({
        where: { id: eksternalId, aktif: true },
      });
      if (!eksternal) {
        throw new NotFoundException(`Penerima eksternal dengan id ${eksternalId} tidak ditemukan atau tidak aktif`);
      }
      penerimaList.push(eksternal);
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 4: Generate nomor surat (only for final/final_tte, draft gets temporary nomor)
      const nomorSurat = status === 'draf' 
        ? `DRAFT-${Date.now()}` 
        : await this.generateNomorSurat(dto.klasifikasi, pengirim.sub_area ?? 0);

      // PHASE 5: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = new Date();

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'SDE',
        klasifikasi: dto.klasifikasi,
        klasifikasi_text: dto.klasifikasi_text || undefined,
        sifat: dto.sifat,
        nomor: nomorSurat,
        tanggal: tanggalHariIni,
        lampiran: dto.lampiran || undefined,
        perihal: dto.perihal,
        konten: dto.konten,
        tempat: dto.nama_tempat || undefined,
        status: status,
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // Determine if this is a draft
      const isDraft = status === 'draf';

      // PHASE 6: Insert sirkulasi - HANYA pengirim (penerima eksternal tidak masuk sirkulasi)
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirim, isDraft);
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 7: Insert lampiran (if any)
      if (dto.lampiran_files && dto.lampiran_files.length > 0) {
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 8: Build kepada_yth dari penerima eksternal
      const kepadaYthList = penerimaList.map((p) => p.nama);
      const kepadaYth = kepadaYthList.join('; ');

      // Build alamat dari penerima pertama (atau gabungan)
      const alamatPenerima = penerimaList.length === 1 
        ? penerimaList[0].alamat || ''
        : penerimaList.map(p => `${p.nama}: ${p.alamat || '-'}`).join('\n');

      // PHASE 9: Insert ke tabel sdi_sde (konten lengkap SDE)
      const sdiSdeEntity = this.sdiSdeRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
        kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
        alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
        nomor: nomorSurat,
        kepadaYth: kepadaYth,
        nama: penerimaList.length === 1 ? penerimaList[0].nama : null,
        alamat: alamatPenerima,
        perihal: dto.perihal,
        konten: dto.konten,
        namaTempat: dto.nama_tempat ?? pengirim.sub_area_text ?? 'Tangerang',
        tanggal: tanggalHariIni,
        namaJabatan: dto.nama_jabatan ?? pengirim.position_text,
        tandaTangan: dto.tanda_tangan ?? null,
        namaLengkap: dto.nama_lengkap ?? pengirim.nama,
        tembusan: null, // SDE tidak ada tembusan internal
        sifat: dto.sifat,
        lampiran: dto.lampiran || null,
      });
      await queryRunner.manager.save(sdiSdeEntity);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build penerima response
      const penerimaResponses: SdePenerimaInfoDto[] = penerimaList.map(
        (ext) => this.toEksternalPenerimaInfo(ext)
      );

      // Return response
      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDE',
          nomor: nomorSurat,
          tanggal: tanggalHariIni.toISOString().split('T')[0],
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
          penerima: penerimaResponses,
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
   * Send Message - Kirim SDE ke pihak eksternal
   * Status: 'final' (tanpa tanda tangan) atau 'final_tte' (dengan tanda tangan)
   */
  async sendMessage(dto: CreateSuratDinasEksternalDto): Promise<SdeSendMessageResponseDto> {
    // Determine status based on tanda_tangan
    const status = dto.tanda_tangan ? 'final_tte' : 'final';
    return this.createSde(dto, status);
  }

  /**
   * Save Draft - Simpan SDE sebagai draft
   * Status: 'draf'
   */
  async saveDraft(dto: CreateSuratDinasEksternalDto): Promise<SdeSendMessageResponseDto> {
    return this.createSde(dto, 'draf');
  }

  // ============================================================
  // UPDATE DRAFT
  // ============================================================

  /**
   * Update Draft - Update data draft SDE (status tetap draf)
   * Partial update - hanya field yang diisi yang akan diupdate
   */
  async updateDraft(
    naskahId: string,
    dto: UpdateSdeDraftDto,
  ): Promise<SdeSendMessageResponseDto> {
    // PHASE 1: Get existing naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(`Naskah sudah berstatus ${naskah.status}, tidak dapat diupdate sebagai draft`);
    }

    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update pengirim
    let barisData: SdeOrgDataPositionDto[] = [];
    let pengirimPosition: SdeOrgDataPositionDto | undefined;

    if (dto.pengirim !== undefined) {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
        );
      }
      barisData = orgData.position_json;

      pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
      if (!pengirimPosition) {
        throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`);
      }
    }

    // PHASE 3: Validate penerima if provided
    let penerimaList: EksternalEntity[] = [];
    if (dto.penerima !== undefined && dto.penerima.length > 0) {
      for (const eksternalId of dto.penerima) {
        const eksternal = await this.eksternalRepository.findOne({
          where: { id: eksternalId, aktif: true },
        });
        if (!eksternal) {
          throw new NotFoundException(`Penerima eksternal dengan id ${eksternalId} tidak ditemukan atau tidak aktif`);
        }
        penerimaList.push(eksternal);
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 4: Update naskah table (only fields that are provided)
      const naskahUpdateData: Partial<NaskahEntity> = {};
      if (dto.klasifikasi !== undefined) naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      if (Object.keys(naskahUpdateData).length > 0) {
        await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);
      }

      // PHASE 5: Update sdi_sde table (only fields that are provided)
      const sdeUpdateData: Partial<SdiSdeEntity> = {};
      if (dto.kop_logo !== undefined) sdeUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) sdeUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) sdeUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) sdeUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) sdeUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) sdeUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) sdeUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.tanda_tangan !== undefined) sdeUpdateData.tandaTangan = dto.tanda_tangan;
      if (dto.nama_lengkap !== undefined) sdeUpdateData.namaLengkap = dto.nama_lengkap;
      if (dto.sifat !== undefined) sdeUpdateData.sifat = dto.sifat;
      if (dto.lampiran !== undefined) sdeUpdateData.lampiran = dto.lampiran;

      // Update kepadaYth, nama, alamat if penerima changed
      if (penerimaList.length > 0) {
        const kepadaYthList = penerimaList.map((p) => p.nama);
        sdeUpdateData.kepadaYth = kepadaYthList.join('; ');
        sdeUpdateData.nama = penerimaList.length === 1 ? penerimaList[0].nama : null;
        sdeUpdateData.alamat = penerimaList.length === 1 
          ? penerimaList[0].alamat || ''
          : penerimaList.map(p => `${p.nama}: ${p.alamat || '-'}`).join('\n');
      }

      if (Object.keys(sdeUpdateData).length > 0) {
        await queryRunner.manager.update(SdiSdeEntity, { idNaskah: naskahId }, sdeUpdateData);
      }

      // PHASE 6: Handle sirkulasi update if pengirim changed
      if (dto.pengirim !== undefined && pengirimPosition) {
        // Delete existing pengirim sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId, sirkuler: 'pengirim' });

        // Re-insert pengirim with is_draft = true
        const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirimPosition, true);
        await queryRunner.manager.save(pengirimSirkulasi);
      }

      // PHASE 7: Update lampiran if changed
      if (dto.lampiran_files !== undefined) {
        // Delete old lampiran
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });

        // Insert new lampiran
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // PHASE 8: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    const sdeData = await this.sdiSdeRepository.findOne({
      where: { idNaskah: naskahId },
    });

    // Get penerima from kepadaYth (parse the names back to external entities)
    const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
    const penerimaResponses: SdePenerimaInfoDto[] = [];
    for (const nama of penerimaNames) {
      const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
      if (ext) {
        penerimaResponses.push(this.toEksternalPenerimaInfo(ext));
      }
    }

    // Handle tanggal - bisa Date object atau string
    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = updatedNaskah.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    return {
      success: true,
      data: {
        id: naskahId,
        jenis: 'SDE',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: 'draf',
        perihal: updatedNaskah?.perihal || '',
        pengirim: {
          position: parseInt(pengirimSirkulasi?.position || '0', 10),
          position_text: pengirimSirkulasi?.positionText || '',
          persnum: parseInt(pengirimSirkulasi?.idSirkuler || '0', 10),
          nama: pengirimSirkulasi?.namaSirkuler || null,
          organization_id: parseInt(pengirimSirkulasi?.organization || '0', 10),
          organization_text: pengirimSirkulasi?.organizationText || '',
          sub_area: parseInt(pengirimSirkulasi?.subArea || '0', 10),
          sub_area_text: pengirimSirkulasi?.subAreaText || null,
          area: pengirimSirkulasi?.area || null,
          area_text: pengirimSirkulasi?.areaText || null,
        },
        penerima: penerimaResponses,
      },
    };
  }

  // ============================================================
  // FINALIZE DRAFT (SEND DRAFT)
  // ============================================================

  /**
   * Finalize Draft - Update draft dan kirim (status final/final_tte)
   * - Generate nomor surat resmi (ganti DRAFT-xxx)
   * - Update status: draf -> final (tanpa tanda_tangan) atau final_tte (dengan tanda_tangan)
   * - Update isDraft = false pada sirkulasi pengirim
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeSdeDraftDto,
  ): Promise<SdeSendMessageResponseDto> {
    // PHASE 1: Get existing naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(`Naskah sudah berstatus ${naskah.status}, tidak dapat difinalize`);
    }

    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data for pengirim validation
    let barisData: SdeOrgDataPositionDto[] = [];
    let pengirimPosition: SdeOrgDataPositionDto | undefined;

    // Get existing pengirim from sirkulasi
    const existingPengirim = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    if (dto.pengirim !== undefined) {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
        );
      }
      barisData = orgData.position_json;

      pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
      if (!pengirimPosition) {
        throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`);
      }
    }

    // PHASE 3: Validate penerima if provided
    let penerimaList: EksternalEntity[] = [];
    if (dto.penerima !== undefined && dto.penerima.length > 0) {
      for (const eksternalId of dto.penerima) {
        const eksternal = await this.eksternalRepository.findOne({
          where: { id: eksternalId, aktif: true },
        });
        if (!eksternal) {
          throw new NotFoundException(`Penerima eksternal dengan id ${eksternalId} tidak ditemukan atau tidak aktif`);
        }
        penerimaList.push(eksternal);
      }
    }

    // PHASE 4: Generate nomor surat resmi
    const subArea = pengirimPosition?.sub_area ?? parseInt(existingPengirim?.subArea || '0', 10);
    const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
    const nomorSurat = await this.generateNomorSurat(klasifikasi, subArea);

    // PHASE 5: Determine new status
    const newStatus = dto.tanda_tangan ? 'final_tte' : 'final';

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 6: Update naskah table (all fields + finalization fields)
      const naskahUpdateData: Partial<NaskahEntity> = {
        nomor: nomorSurat,
        status: newStatus,
      };
      if (dto.klasifikasi !== undefined) naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);

      // PHASE 7: Update sdi_sde table
      const sdeUpdateData: Partial<SdiSdeEntity> = {
        nomor: nomorSurat,
        tandaTangan: dto.tanda_tangan || null,
      };
      if (dto.kop_logo !== undefined) sdeUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) sdeUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) sdeUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) sdeUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) sdeUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) sdeUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) sdeUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.nama_lengkap !== undefined) sdeUpdateData.namaLengkap = dto.nama_lengkap;
      if (dto.sifat !== undefined) sdeUpdateData.sifat = dto.sifat;
      if (dto.lampiran !== undefined) sdeUpdateData.lampiran = dto.lampiran;

      // Update kepadaYth, nama, alamat if penerima changed
      if (penerimaList.length > 0) {
        const kepadaYthList = penerimaList.map((p) => p.nama);
        sdeUpdateData.kepadaYth = kepadaYthList.join('; ');
        sdeUpdateData.nama = penerimaList.length === 1 ? penerimaList[0].nama : null;
        sdeUpdateData.alamat = penerimaList.length === 1 
          ? penerimaList[0].alamat || ''
          : penerimaList.map(p => `${p.nama}: ${p.alamat || '-'}`).join('\n');
      }

      await queryRunner.manager.update(SdiSdeEntity, { idNaskah: naskahId }, sdeUpdateData);

      // PHASE 8: Handle sirkulasi update
      if (dto.pengirim !== undefined && pengirimPosition) {
        // Delete existing pengirim sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId, sirkuler: 'pengirim' });

        // Re-insert pengirim with is_draft = FALSE (finalized!)
        const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirimPosition, false);
        await queryRunner.manager.save(pengirimSirkulasi);
      } else {
        // Just update isDraft = false on existing sirkulasi
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId },
          { isDraft: false },
        );
      }

      // PHASE 9: Update lampiran if provided
      if (dto.lampiran_files !== undefined) {
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // PHASE 10: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    const sdeData = await this.sdiSdeRepository.findOne({
      where: { idNaskah: naskahId },
    });

    // Get penerima from kepadaYth
    const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
    const penerimaResponses: SdePenerimaInfoDto[] = [];
    for (const nama of penerimaNames) {
      const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
      if (ext) {
        penerimaResponses.push(this.toEksternalPenerimaInfo(ext));
      }
    }

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = updatedNaskah.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    return {
      success: true,
      data: {
        id: naskahId,
        jenis: 'SDE',
        nomor: nomorSurat,
        tanggal: tanggalStr,
        status: newStatus,
        perihal: updatedNaskah?.perihal || '',
        pengirim: {
          position: parseInt(pengirimSirkulasi?.position || '0', 10),
          position_text: pengirimSirkulasi?.positionText || '',
          persnum: parseInt(pengirimSirkulasi?.idSirkuler || '0', 10),
          nama: pengirimSirkulasi?.namaSirkuler || null,
          organization_id: parseInt(pengirimSirkulasi?.organization || '0', 10),
          organization_text: pengirimSirkulasi?.organizationText || '',
          sub_area: parseInt(pengirimSirkulasi?.subArea || '0', 10),
          sub_area_text: pengirimSirkulasi?.subAreaText || null,
          area: pengirimSirkulasi?.area || null,
          area_text: pengirimSirkulasi?.areaText || null,
        },
        penerima: penerimaResponses,
      },
    };
  }

  // ============================================================
  // GET DRAFT LIST
  // ============================================================

  /**
   * Get all draft SDE by position (where position is pengirim)
   * Returns list of draft messages with full data
   * @param positionId - The position ID of the sender
   * @param tgl - Optional date for validation (default: today)
   */
  async getDraftList(positionId: number, tgl?: string): Promise<any> {
    // Get org_data to validate position exists
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);
    
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: SdeOrgDataPositionDto) => Number(pos.position) === Number(positionId)
    );

    if (!positionData) {
      throw new NotFoundException(`Position dengan id ${positionId} tidak ditemukan di org_data`);
    }

    const positionIdStr = String(positionId);

    // Get all naskah where position is pengirim, jenis = SDE, and status = draf
    const draftNaskahList = await this.naskahSirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .innerJoin(NaskahEntity, 'naskah', 'naskah.id = sirkulasi.idNaskah')
      .select([
        'naskah.id AS id',
        'naskah.jenis AS jenis',
        'naskah.nomor AS nomor',
        'naskah.tanggal AS tanggal',
        'naskah.perihal AS perihal',
        'naskah.status AS status',
        'naskah.sifat AS sifat',
        'naskah.klasifikasi AS klasifikasi',
        'naskah.klasifikasi_text AS klasifikasi_text',
        'naskah.konten AS konten',
        'naskah.tempat AS tempat',
        'naskah.lampiran AS lampiran',
        'naskah.english AS english',
      ])
      .where('sirkulasi.position = :positionId', { positionId: positionIdStr })
      .andWhere('sirkulasi.sirkuler = :type', { type: 'pengirim' })
      .andWhere('naskah.jenis = :jenis', { jenis: 'SDE' })
      .andWhere('naskah.status = :status', { status: 'draf' })
      .orderBy('naskah.tanggal', 'DESC')
      .getRawMany();

    // Build response with full data for each naskah
    const results: any[] = [];

    for (const naskah of draftNaskahList) {
      // Get sde data for this naskah
      const sdeData = await this.sdiSdeRepository.findOne({
        where: { idNaskah: naskah.id },
      });

      // Get pengirim sirkulasi
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'pengirim',
        },
      });

      // Get lampiran files
      const lampiranFiles = await this.naskahLampiranRepository.find({
        where: { id_naskah: naskah.id },
      });

      // Get penerima from kepadaYth
      const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
      const penerimaList: SdePenerimaInfoDto[] = [];
      for (const nama of penerimaNames) {
        const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
        if (ext) {
          penerimaList.push(this.toEksternalPenerimaInfo(ext));
        }
      }

      // Format tanggal
      const tanggalStr = naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal || '').split('T')[0];

      results.push({
        id: naskah.id,
        jenis: naskah.jenis || 'SDE',
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        status: naskah.status,

        // Kop Naskah
        kop_logo: sdeData?.kopLogo || null,
        kop_nama: sdeData?.kopNama || null,
        alamat_perusahaan: sdeData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh
        konten: sdeData?.konten || naskah.konten || null,

        // Kaki
        nama_tempat: sdeData?.namaTempat || naskah.tempat || null,
        nama_jabatan: sdeData?.namaJabatan || null,
        tanda_tangan: sdeData?.tandaTangan || null,
        nama_lengkap: sdeData?.namaLengkap || null,

        // Sirkulasi
        pengirim: {
          position: parseInt(pengirimSirkulasi?.position || '0', 10),
          position_text: pengirimSirkulasi?.positionText || '',
          persnum: parseInt(pengirimSirkulasi?.idSirkuler || '0', 10),
          nama: pengirimSirkulasi?.namaSirkuler || '',
          organization_id: parseInt(pengirimSirkulasi?.organization || '0', 10),
          organization_text: pengirimSirkulasi?.organizationText || '',
          sub_area: parseInt(pengirimSirkulasi?.subArea || '0', 10),
          sub_area_text: pengirimSirkulasi?.subAreaText || '',
          area: pengirimSirkulasi?.area || '',
          area_text: pengirimSirkulasi?.areaText || '',
        },
        penerima: penerimaList,

        // Lampiran
        lampiran: naskah.lampiran || null,
        lampiran_files: lampiranFiles.map((l) => ({
          id: l.id,
          fileName: l.file_name || '',
          filePath: l.file_pdf || '',
        })),
      });
    }

    return {
      success: true,
      data: results,
      total: results.length,
      position: positionData.position,
      position_text: positionData.position_text || '',
      persnum: positionData.persnum,
      nama: positionData.nama || '',
    };
  }
}
