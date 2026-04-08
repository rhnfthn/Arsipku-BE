import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import {
  CreateNaskahDinasDto,
  NdOrgDataPositionDto,
  EksternalSenderDto,
  NaskahDinasRecipientResponseDto,
  NdSendMessageResponseDto,
  NdGetAllResponseDto,
  NdGetDetailResponseDto,
  NdPengirimInfoDto,
  NdPenerimaInfoDto,
  NdPembuatInfoDto,
} from '../dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { StorageService } from '../../storage/services/storage.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI

@Injectable()
export class NaskahDinasService {
  constructor(
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly storageService: StorageService,
  ) {}

  private getScopedAreaCode(user: JwtPayload): string | undefined {
    const requesterAreaCode = String(user?.area || '').trim().toUpperCase();

    if (!requesterAreaCode) {
      throw new BadRequestException('Area code tidak ditemukan pada token user');
    }

    return requesterAreaCode === 'A000' ? undefined : requesterAreaCode;
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Helper: Convert EksternalEntity to NdPengirimInfoDto
   */
  private toEksternalPengirimInfo(ext: EksternalEntity): NdPengirimInfoDto {
    return {
      id: ext.id,
      nama: ext.nama,
      alamat: ext.alamat || '',
      telepon: ext.telepon || '',
      email: ext.email || '',
      kontak: ext.kontak || '',
    };
  }

  /**
   * Helper: Convert NdOrgDataPositionDto to NdPenerimaInfoDto
   */
  private toPenerimaInfo(pos: NdOrgDataPositionDto): NdPenerimaInfoDto {
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
   * Helper: Create sirkulasi for penerima (internal from org_data)
   */
  private createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'penerima',
    pos: NdOrgDataPositionDto,
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
      idSirkuler: String(pos.persnum_person ?? pos.persnum ?? pos.position ?? ''),
      namaSirkuler: pos.persnum_person_text ?? pos.nama ?? pos.position_text ?? '',
      isDraft: false,
    });

    return sirkulasi;
  }

  /**
   * Helper: Create sirkulasi for pengirim (eksternal)
   */
  private createSirkulasiFromEksternal(
    idNaskah: string,
    eksternal: EksternalEntity,
  ): NaskahSirkulasi {
    const sirkulasi = this.naskahSirkulasiRepository.create({
      id: uuidv4(),
      idNaskah,
      sirkuler: 'pengirim',
      company: eksternal.company ?? null,
      companyText: null,
      area: eksternal.area ?? null,
      areaText: null,
      subArea: null,
      subAreaText: null,
      organization: null,
      organizationText: null,
      position: eksternal.id,
      positionText: eksternal.nama,
      positionStatus: 'ybs',
      idSirkuler: null,
      namaSirkuler: null,
      isDraft: false,
    });

    return sirkulasi;
  }

  /**
   * Parse form-data body + uploaded file to CreateNaskahDinasDto
   * 
   * Form field names sesuai UI:
   * - tanggal_surat: Tanggal Surat
   * - sifat_naskah: Sifat Naskah
   * - nomor_asal: Nomor Asal Naskah
   * - asal_naskah: Asal Naskah (eksternal.id)
   * - perihal: Perihal
   * - lampiran: Lampiran (text)
   * - tertuju: Tertuju (array positionId)
   * - file_attachment: File attachment (PDF)
   */
  async parseFormDataToCreateDto(
    body: any,
    file?: Express.Multer.File,
  ): Promise<{ dto: CreateNaskahDinasDto; file?: Express.Multer.File }> {
    // Helper: Parse number array field
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

    // Parse tertuju - array of positionId (penerima internal)
    const tertujuArray = parseNumberArray(body.tertuju);
    if (tertujuArray.length === 0) {
      throw new BadRequestException('Minimal harus ada 1 penerima (tertuju)');
    }

    // Build DTO dengan field names sesuai form UI
    const dto: CreateNaskahDinasDto = {
      tanggal_surat: body.tanggal_surat,
      sifat_naskah: body.sifat_naskah || 'biasa',
      nomor_asal: body.nomor_asal,
      asal_naskah: body.asal_naskah,
      perihal: body.perihal,
      lampiran: body.lampiran,
      tertuju: tertujuArray,
      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      konten: body.konten,
      english: body.english === 'true' || body.english === true,
      created_by_position_id: body.created_by_position_id,
    };

    return { dto, file };
  }

  // ============================================================
  // GET RECIPIENTS
  // ============================================================

  /**
   * Get all external senders (aktif only)
   */
  private async getExternalSenders(): Promise<EksternalSenderDto[]> {
    const externals = await this.eksternalRepository.find({
      where: { aktif: true },
      order: { nama: 'ASC' },
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
   * Get Naskah Dinas recipients using org_data
   * 
   * Naskah Dinas (kebalikan dari SDE):
   * - Pengirim: dari tabel eksternal (pihak luar perusahaan)
   * - Penerima: dari org_data (internal users dengan chief=1)
   */
  async getRecipients(
    tgl?: string,
    user?: JwtPayload,
  ): Promise<NaskahDinasRecipientResponseDto> {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const scopedAreaCode = this.getScopedAreaCode(user as JwtPayload);

    // Get cached org data
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan.`,
      );
    }

    const barisData: NdOrgDataPositionDto[] = orgData.position_json;

    // Filter only managerial positions (chief=1) as valid recipients
    // Scope area: A000 (pusat) melihat semua, selain itu hanya area user login
    const recipients = barisData.filter((pos) => {
      if (pos.chief !== 1) {
        return false;
      }

      if (!scopedAreaCode) {
        return true;
      }

      const recipientAreaCode = String(pos.area || '').trim().toUpperCase();
      return recipientAreaCode === scopedAreaCode;
    });

    return {
      recipients,
      totalRecipients: recipients.length,
    };
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  /**
   * Send Naskah Dinas
   * - Asal Naskah (asal_naskah): eksternal.id
   * - Tertuju (tertuju): internal users (positionId)
   * - File attachment langsung ke final_pdf
   * - Tidak ada sdi_sde table
   */
  async sendMessage(
    dto: CreateNaskahDinasDto,
    file?: Express.Multer.File,
  ): Promise<NdSendMessageResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Parse tanggal untuk org_data lookup
      let tanggal = new Date().toISOString().split('T')[0];
      if (dto.tanggal_surat) {
        // Support format DD.MM.YYYY atau YYYY-MM-DD
        if (dto.tanggal_surat.includes('.')) {
          const [day, month, year] = dto.tanggal_surat.split('.');
          tanggal = `${year}-${month}-${day}`;
        } else {
          tanggal = dto.tanggal_surat;
        }
      }

      // 1. Validate asal_naskah (eksternal sender)
      const pengirimEksternal = await this.eksternalRepository.findOne({
        where: { id: dto.asal_naskah, aktif: true },
      });

      if (!pengirimEksternal) {
        throw new NotFoundException(
          `Asal naskah dengan ID ${dto.asal_naskah} tidak ditemukan atau tidak aktif`,
        );
      }

      // 2. Validate tertuju (internal recipients)
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan`,
        );
      }

      const barisData: NdOrgDataPositionDto[] = orgData.position_json;
      const penerimaPositions: NdOrgDataPositionDto[] = [];

      for (const posId of dto.tertuju) {
        const position = barisData.find((p) => Number(p.position) === Number(posId));
        if (!position) {
          throw new NotFoundException(
            `Penerima dengan positionId ${posId} tidak ditemukan`,
          );
        }
        penerimaPositions.push(position);
      }

      // 3. Upload file to storage (if provided)
      let finalPdfPath: string | null = null;
      if (file) {
        const uploadResult = await this.storageService.uploadFile(
          file,
          'naskah-dinas/final',
        );
        finalPdfPath = uploadResult.key;
      }

      // 4. Create naskah record (jenis = SDE, tapi sirkulasi hanya penerima)
      const naskahId = uuidv4();
      
      // Parse tanggal surat untuk naskah
      let tanggalNaskah = new Date();
      if (dto.tanggal_surat) {
        if (dto.tanggal_surat.includes('.')) {
          const [day, month, year] = dto.tanggal_surat.split('.');
          tanggalNaskah = new Date(`${year}-${month}-${day}`);
        } else {
          tanggalNaskah = new Date(dto.tanggal_surat);
        }
      }

      const naskah = new NaskahEntity();
      naskah.id = naskahId;
      naskah.jenis = 'SDE'; // Masuk sebagai SDE
      naskah.nomor = dto.nomor_asal || null; // Nomor Asal Naskah → naskah.nomor
      naskah.klasifikasi = dto.klasifikasi || '';
      naskah.sifat = dto.sifat_naskah as any; // Sifat Naskah
      naskah.perihal = dto.perihal;
      naskah.lampiran = dto.lampiran || ''; // Lampiran (text description)
      naskah.konten = dto.konten || '';
      naskah.status = 'final'; // Naskah Dinas langsung final
      naskah.final_pdf = finalPdfPath || '';
      naskah.tanggal = tanggalNaskah;
      naskah.tempat = dto.asal_naskah; // Simpan eksternal.id untuk referensi pengirim
      naskah.createdByPosition = dto.created_by_position_id || null; // Simpan position ID pembuat

      await queryRunner.manager.save(naskah);

      // 5. Create sirkulasi untuk pengirim (eksternal)
      const sirkulasiPengirim = this.createSirkulasiFromEksternal(naskahId, pengirimEksternal);
      await queryRunner.manager.save(sirkulasiPengirim);

      // 6. Create sirkulasi untuk penerima (internal user)
      const penerimaResponses: NdPenerimaInfoDto[] = [];
      for (const pos of penerimaPositions) {
        const sirkulasiPenerima = this.createSirkulasiFromOrgData(naskahId, 'penerima', pos);
        await queryRunner.manager.save(sirkulasiPenerima);
        penerimaResponses.push(this.toPenerimaInfo(pos));
      }

      await queryRunner.commitTransaction();

      // Lookup pembuat dari org_data untuk response
      let pembuatInfo: NdPembuatInfoDto | null = null;
      if (dto.created_by_position_id) {
        const pembuatPos = barisData.find((p) => String(p.position) === String(dto.created_by_position_id));
        if (pembuatPos) {
          pembuatInfo = {
            position: pembuatPos.position,
            position_text: pembuatPos.position_text,
            persnum: pembuatPos.persnum_person || null,
            nama: pembuatPos.persnum_person_text || null,
            organization_id: pembuatPos.organization_id,
            organization_text: pembuatPos.organization_text,
            sub_area: pembuatPos.sub_area || null,
            sub_area_text: pembuatPos.sub_area_text || null,
            area: pembuatPos.area || null,
            area_text: pembuatPos.area_text || null,
          };
        }
      }

      // Generate signed URL for file
      let finalPdfUrl: string | null = null;
      if (finalPdfPath) {
        try {
          finalPdfUrl = await this.storageService.getFileUrl(finalPdfPath);
        } catch (error) {
          console.warn(`Failed to get signed URL for ${finalPdfPath}:`, error.message);
        }
      }

      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDE',
          nomor: dto.nomor_asal || null,
          tanggal: tanggalNaskah.toISOString().split('T')[0],
          jam: new Date().toISOString().split('T')[1].split('.')[0], // HH:mm:ss
          status: 'final',
          perihal: dto.perihal,
          final_pdf: finalPdfPath,
          final_pdf_url: finalPdfUrl,
          pengirim: this.toEksternalPengirimInfo(pengirimEksternal),
          penerima: penerimaResponses,
          pembuat: pembuatInfo,
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
  // GET ALL
  // ============================================================

  /**
   * Get all Naskah Dinas (tanpa pagination)
   * Naskah Dinas = SDE dengan pengirim eksternal (field tempat berisi eksternal.id)
   * 
   * @param positionId - Optional filter by penerima position
   * @param userArea - User's area from JWT token. If not A000 (kantor pusat), filter data by user's area
   */
  async getAll(
    positionId?: number,
    userArea?: string,
  ): Promise<NdGetAllResponseDto> {
    // Build base query - SDE dengan tempat not null (menandakan pengirim eksternal)
    let query = this.naskahRepository
      .createQueryBuilder('naskah')
      .where('naskah.jenis = :jenis', { jenis: 'SDE' })
      .andWhere('naskah.tempat IS NOT NULL')
      .orderBy('naskah.tanggal', 'DESC');

    const shouldFilterByArea = !!userArea && userArea !== 'A000';
    const shouldJoinSirkulasi = !!positionId || shouldFilterByArea;

    // Join sirkulasi hanya jika perlu filter berdasarkan position/area.
    // Untuk user kantor pusat (A000) tanpa positionId, query tidak difilter area.
    if (shouldJoinSirkulasi) {
      query = query
        .distinct(true)
        .innerJoin('naskah_sirkulasi', 'sirkulasi', 'sirkulasi.idNaskah = naskah.id')
        .andWhere('sirkulasi.sirkuler = :sirkuler', { sirkuler: 'penerima' });
    }

    // If positionId provided, filter by specific position
    if (positionId) {
      query = query.andWhere('sirkulasi.position = :position', { position: String(positionId) });
    }

    // If user is not from kantor pusat (A000), filter by user's area
    if (shouldFilterByArea) {
      query = query.andWhere('sirkulasi.area = :area', { area: userArea });
    }

    const naskahList = await query.getMany();

    // Get org_data untuk lookup pembuat
    const today = new Date().toISOString().split('T')[0];
    let barisData: NdOrgDataPositionDto[] = [];
    try {
      const orgData = await this.orgDataService.findOrg(today);
      if (orgData && orgData.position_json) {
        barisData = orgData.position_json;
      }
    } catch (err) {
      // Ignore error
    }

    // Get sirkulasi data + pengirim eksternal for each naskah
    const dataPromises = naskahList.map(async (naskah) => {
      const sirkulasiList = await this.naskahSirkulasiRepository.find({
        where: { idNaskah: naskah.id },
      });

      let penerimaSirkulasiList = sirkulasiList.filter((s) => s.sirkuler === 'penerima');
      
      // If user is not from kantor pusat, re-filter penerima by user's area for extra safety
      if (userArea && userArea !== 'A000') {
        penerimaSirkulasiList = penerimaSirkulasiList.filter((s) => s.area === userArea);
      }

      // Ambil data pengirim dari tabel eksternal berdasarkan naskah.tempat (eksternal.id)
      let pengirimInfo: NdPengirimInfoDto = {
        id: '',
        nama: 'Eksternal',
        alamat: '',
        telepon: '',
        email: '',
        kontak: '',
      };

      if (naskah.tempat) {
        try {
          const eksternal = await this.eksternalRepository.findOne({
            where: { id: naskah.tempat },
          });
          if (eksternal) {
            pengirimInfo = this.toEksternalPengirimInfo(eksternal);
          }
        } catch (err) {
          // Error ignored
        }
      }

      // Build penerima info from sirkulasi
      const penerimaInfo: NdPenerimaInfoDto[] = penerimaSirkulasiList.map((s) => ({
        position: Number(s.position) || 0,
        position_text: s.positionText || '',
        persnum: Number(s.idSirkuler) || null,
        nama: s.namaSirkuler || null,
        organization_id: Number(s.organization) || 0,
        organization_text: s.organizationText || '',
        sub_area: Number(s.subArea) || null,
        sub_area_text: s.subAreaText || null,
        area: s.area || null,
        area_text: s.areaText || null,
      }));

      // Handle tanggal - bisa Date object atau string dari DB
      let tanggalStr = '';
      if (naskah.tanggal) {
        tanggalStr = naskah.tanggal instanceof Date 
          ? naskah.tanggal.toISOString().split('T')[0]
          : String(naskah.tanggal).split('T')[0];
      }

      // Get jam UTC from createdAt (hanya waktu tanpa tanggal)
      let jamUtc = '';
      if (naskah.createdAt) {
        const dateObj = naskah.createdAt instanceof Date
          ? naskah.createdAt
          : new Date(naskah.createdAt);
        jamUtc = dateObj.toISOString().split('T')[1].split('.')[0]; // HH:mm:ss
      }

      // Lookup pembuat dari org_data
      let pembuatInfo: NdPembuatInfoDto | null = null;
      if (naskah.createdByPosition && barisData.length > 0) {
        const pembuatPos = barisData.find((p) => String(p.position) === String(naskah.createdByPosition));
        if (pembuatPos) {
          pembuatInfo = {
            position: pembuatPos.position,
            position_text: pembuatPos.position_text,
            persnum: pembuatPos.persnum_person || null,
            nama: pembuatPos.persnum_person_text || null,
            organization_id: pembuatPos.organization_id,
            organization_text: pembuatPos.organization_text,
            sub_area: pembuatPos.sub_area || null,
            sub_area_text: pembuatPos.sub_area_text || null,
            area: pembuatPos.area || null,
            area_text: pembuatPos.area_text || null,
          };
        }
      }

      // Generate signed URL for file
      let finalPdfUrl: string | null = null;
      if (naskah.final_pdf) {
        try {
          finalPdfUrl = await this.storageService.getFileUrl(naskah.final_pdf);
        } catch (error) {
          console.warn(`Failed to get signed URL for ${naskah.final_pdf}:`, error.message);
        }
      }

      return {
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        jam: jamUtc,
        status: naskah.status,
        perihal: naskah.perihal,
        final_pdf: naskah.final_pdf,
        final_pdf_url: finalPdfUrl,
        pengirim: pengirimInfo,
        penerima: penerimaInfo,
        pembuat: pembuatInfo,
      };
    });

    const data = await Promise.all(dataPromises);

    return {
      success: true,
      data,
      total: data.length,
    };
  }

  // ============================================================
  // GET DETAIL
  // ============================================================

  /**
   * Get detail of a single Naskah Dinas
   * Pengirim diambil dari tabel eksternal berdasarkan field tempat (eksternal.id)
   */
  async getDetail(id: string): Promise<NdGetDetailResponseDto> {
    // Find naskah - SDE dengan tempat not null (pengirim eksternal)
    const naskah = await this.naskahRepository.findOne({
      where: { id, jenis: 'SDE' },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah Dinas dengan ID ${id} tidak ditemukan`);
    }

    // Verify bahwa ini Naskah Dinas (tempat harus berisi eksternal.id)
    if (!naskah.tempat) {
      throw new NotFoundException(`Naskah dengan ID ${id} adalah SDE biasa, bukan Naskah Dinas`);
    }

    // Get sirkulasi
    const sirkulasiList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: id },
    });

    const penerimaSirkulasiList = sirkulasiList.filter((s) => s.sirkuler === 'penerima');

    // Ambil data pengirim dari tabel eksternal berdasarkan naskah.tempat (eksternal.id)
    let pengirimInfo: NdPengirimInfoDto = {
      id: '',
      nama: 'Eksternal',
      alamat: '',
      telepon: '',
      email: '',
      kontak: '',
    };

    if (naskah.tempat) {
      try {
        const eksternal = await this.eksternalRepository.findOne({
          where: { id: naskah.tempat },
        });
        if (eksternal) {
          pengirimInfo = this.toEksternalPengirimInfo(eksternal);
        }
      } catch (err) {
        // Error ignored
      }
    }

    // Build penerima info
    const penerimaInfo: NdPenerimaInfoDto[] = penerimaSirkulasiList.map((s) => ({
      position: Number(s.position) || 0,
      position_text: s.positionText || '',
      persnum: Number(s.idSirkuler) || null,
      nama: s.namaSirkuler || null,
      organization_id: Number(s.organization) || 0,
      organization_text: s.organizationText || '',
      sub_area: Number(s.subArea) || null,
      sub_area_text: s.subAreaText || null,
      area: s.area || null,
      area_text: s.areaText || null,
    }));

    // Handle tanggal - bisa Date object atau string dari DB
    let tanggalStr = '';
    if (naskah.tanggal) {
      tanggalStr = naskah.tanggal instanceof Date 
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal).split('T')[0];
    }

    // Get jam UTC from createdAt (hanya waktu tanpa tanggal)
    let jamUtc = '';
    if (naskah.createdAt) {
      const dateObj = naskah.createdAt instanceof Date
        ? naskah.createdAt
        : new Date(naskah.createdAt);
      jamUtc = dateObj.toISOString().split('T')[1].split('.')[0]; // HH:mm:ss
    }

    // Lookup pembuat dari org_data
    let pembuatInfo: NdPembuatInfoDto | null = null;
    if (naskah.createdByPosition) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const orgData = await this.orgDataService.findOrg(today);
        if (orgData && orgData.position_json) {
          const barisData: NdOrgDataPositionDto[] = orgData.position_json;
          const pembuatPos = barisData.find((p) => String(p.position) === String(naskah.createdByPosition));
          if (pembuatPos) {
            pembuatInfo = {
              position: pembuatPos.position,
              position_text: pembuatPos.position_text,
              persnum: pembuatPos.persnum_person || null,
              nama: pembuatPos.persnum_person_text || null,
              organization_id: pembuatPos.organization_id,
              organization_text: pembuatPos.organization_text,
              sub_area: pembuatPos.sub_area || null,
              sub_area_text: pembuatPos.sub_area_text || null,
              area: pembuatPos.area || null,
              area_text: pembuatPos.area_text || null,
            };
          }
        }
      } catch (err) {
        // Ignore error
      }
    }

    // Generate signed URL for file
    let finalPdfUrl: string | null = null;
    if (naskah.final_pdf) {
      try {
        finalPdfUrl = await this.storageService.getFileUrl(naskah.final_pdf);
      } catch (error) {
        console.warn(`Failed to get signed URL for ${naskah.final_pdf}:`, error.message);
      }
    }

    return {
      success: true,
      data: {
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        jam: jamUtc,
        status: naskah.status,
        perihal: naskah.perihal,
        final_pdf: naskah.final_pdf,
        final_pdf_url: finalPdfUrl,
        pengirim: pengirimInfo,
        penerima: penerimaInfo,
        pembuat: pembuatInfo,
      },
    };
  }
}
