import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahDinasVerifikatorEntity } from '../entities/naskah-dinas-verifikator.entity';
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
  NdVerifikatorProgressDto,
} from '../dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { StorageService } from '../../storage/services/storage.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { v4 as uuidv4 } from 'uuid';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';

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
    @InjectRepository(NaskahDinasVerifikatorEntity)
    private readonly verifikatorRepository: Repository<NaskahDinasVerifikatorEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly storageService: StorageService,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {}

  private getScopedAreaCode(user: JwtPayload): string | undefined {
    const requesterAreaCode = String(user?.area || '').trim().toUpperCase();

    if (!requesterAreaCode) {
      throw new BadRequestException('Area code tidak ditemukan pada token user');
    }

    return requesterAreaCode === 'A000' ? undefined : requesterAreaCode;
  }

  private parseNumberArray(value: any): number[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(Number).filter((item) => Number.isFinite(item));
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map(Number).filter((item) => Number.isFinite(item));
        }
        const parsedNumber = Number(parsed);
        return Number.isFinite(parsedNumber) ? [parsedNumber] : [];
      } catch {
        return value
          .split(',')
          .map((v: string) => Number(v.trim()))
          .filter((item) => Number.isFinite(item));
      }
    }
    const parsedNumber = Number(value);
    return Number.isFinite(parsedNumber) ? [parsedNumber] : [];
  }

  private normalizeSifat(value?: string): 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka' {
    const normalized = String(value || 'biasa')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');

    const map: Record<string, 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka'> = {
      sangat_rahasia: 'sangat_rahasia',
      rahasia: 'rahasia',
      terbatas: 'terbatas',
      biasa: 'biasa',
      terbuka: 'terbuka',
      'biasa/terbuka': 'biasa',
      biasa_terbuka: 'biasa',
    };

    return map[normalized] || 'biasa';
  }

  private getVerifikatorProgress(
    verifikators: NaskahDinasVerifikatorEntity[],
  ): NdVerifikatorProgressDto {
    const total = verifikators.length;
    const verified = verifikators.filter((v) => v.status === 'verified').length;
    const rejected = verifikators.filter((v) => v.status === 'rejected').length;
    const waiting = verifikators.find((v) => v.status === 'waiting') || null;

    return {
      verified,
      total,
      rejected,
      currentOrder: waiting?.urutan || null,
      status:
        total === 0
          ? 'none'
          : rejected > 0
            ? 'rejected'
            : verified === total
              ? 'completed'
              : 'on_progress',
    };
  }

  private toVerifikatorInfo(verifikator: NaskahDinasVerifikatorEntity) {
    return {
      id: verifikator.id,
      urutan: verifikator.urutan,
      persnum: verifikator.persnum,
      nama: verifikator.nama,
      jabatan: verifikator.jabatan,
      lokasi: verifikator.lokasi,
      positionId: verifikator.positionId,
      status: verifikator.status,
      verifiedAt: verifikator.verifiedAt,
      rejectedAt: verifikator.rejectedAt,
      keterangan: verifikator.keterangan,
    };
  }

  private createVerifikatorEntities(
    idNaskah: string,
    persnums: number[],
    positions: NdOrgDataPositionDto[],
  ): NaskahDinasVerifikatorEntity[] {
    const uniquePersnums = Array.from(new Set(persnums.filter((item) => Number.isFinite(item))));

    return uniquePersnums.map((persnum, index) => {
      const position = positions.find(
        (p) =>
          Number(p.persnum_person) === Number(persnum) ||
          Number(p.persnum) === Number(persnum),
      );

      if (!position) {
        throw new NotFoundException(`Verifikator dengan persnum ${persnum} tidak ditemukan`);
      }

      const rawPosition = position as any;

      return this.verifikatorRepository.create({
        id: uuidv4(),
        idNaskah,
        urutan: index + 1,
        persnum,
        nama: position.persnum_person_text || position.nama || null,
        jabatan: position.position_text || null,
        lokasi: position.sub_area_text || position.area_text || null,
        positionId: position.position ? Number(position.position) : null,
        company: rawPosition.company ? String(rawPosition.company) : null,
        companyText: rawPosition.company_name || rawPosition.companyText || null,
        area: position.area || null,
        areaText: position.area_text || null,
        subArea: position.sub_area ? String(position.sub_area) : null,
        subAreaText: position.sub_area_text || null,
        organization: position.organization_id ? String(position.organization_id) : null,
        organizationText: position.organization_text || null,
        status: index === 0 ? 'waiting' : 'pending',
      });
    });
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
    // Parse tertuju - array of positionId (penerima internal)
    const tertujuArray = this.parseNumberArray(body.tertuju ?? body['tertuju[]']);
    if (tertujuArray.length === 0) {
      throw new BadRequestException('Minimal harus ada 1 penerima (tertuju)');
    }

    const verifikatorArray = this.parseNumberArray(
      body.verifikator ??
        body['verifikator[]'] ??
        body.verifikator_ids ??
        body['verifikator_ids[]'],
    );

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
      verifikator: verifikatorArray,
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
      naskah.sifat = this.normalizeSifat(dto.sifat_naskah); // Sifat Naskah
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

      const verifikatorRows = this.createVerifikatorEntities(
        naskahId,
        dto.verifikator || [],
        barisData,
      );
      if (verifikatorRows.length > 0) {
        await queryRunner.manager.save(verifikatorRows);
      }

      const verifikatorProgress = this.getVerifikatorProgress(verifikatorRows);

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
          sifat: naskah.sifat,
          klasifikasi: naskah.klasifikasi,
          lampiran: naskah.lampiran,
          perihal: dto.perihal,
          final_pdf: finalPdfPath,
          final_pdf_url: finalPdfUrl,
          pengirim: this.toEksternalPengirimInfo(pengirimEksternal),
          penerima: penerimaResponses,
          pembuat: pembuatInfo,
          verifikatorProgress,
          totalVerifikator: verifikatorRows.length,
          verifikators: verifikatorRows.map((verifikator) => this.toVerifikatorInfo(verifikator)),
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

    if (naskahList.length === 0) {
      return { success: true, data: [], total: 0 };
    }

    // ============================================================
    // BULK FETCH (eliminasi N+1)
    // ============================================================
    const naskahIds = naskahList.map((n) => n.id).filter(Boolean);
    const tempatIds = naskahList.map((n) => n.tempat).filter((t): t is string => !!t);

    // 1. Bulk semua sirkulasi sekaligus
    const allSirkulasi = naskahIds.length
      ? await this.naskahSirkulasiRepository.find({
          where: { idNaskah: In(naskahIds) },
        })
      : [];
    const sirkulasiByNaskah = new Map<string, typeof allSirkulasi>();
    for (const s of allSirkulasi) {
      if (!s.idNaskah) continue;
      if (!sirkulasiByNaskah.has(s.idNaskah)) sirkulasiByNaskah.set(s.idNaskah, []);
      sirkulasiByNaskah.get(s.idNaskah)!.push(s);
    }

    const allVerifikators = naskahIds.length
      ? await this.verifikatorRepository.find({
          where: { idNaskah: In(naskahIds) },
          order: { urutan: 'ASC' },
        })
      : [];
    const verifikatorsByNaskah = new Map<string, NaskahDinasVerifikatorEntity[]>();
    for (const verifikator of allVerifikators) {
      if (!verifikatorsByNaskah.has(verifikator.idNaskah)) {
        verifikatorsByNaskah.set(verifikator.idNaskah, []);
      }
      verifikatorsByNaskah.get(verifikator.idNaskah)!.push(verifikator);
    }

    // 2. Bulk eksternal pengirim
    const eksternalMap = new Map<string, any>();
    if (tempatIds.length > 0) {
      const uniqueTempat = Array.from(new Set(tempatIds));
      const eksternalList = await this.eksternalRepository.find({
        where: { id: In(uniqueTempat) },
      });
      for (const e of eksternalList) eksternalMap.set(e.id, e);
    }

    // 3. Get org_data untuk lookup pembuat (sudah ter-cache di OrgDataService)
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
    const positionMap = new Map<string, NdOrgDataPositionDto>();
    for (const p of barisData) {
      if (p.position != null) positionMap.set(String(p.position), p);
    }

    // 4. Bulk signed URL (paralel) — ini yang biasanya dominan latency
    const finalPdfUrlMap = new Map<string, string>();
    const naskahWithPdf = naskahList.filter((n) => !!n.final_pdf);
    await Promise.all(
      naskahWithPdf.map(async (n) => {
        try {
          const url = await this.storageService.getFileUrl(n.final_pdf!);
          if (url) finalPdfUrlMap.set(n.id, url);
        } catch (err: any) {
          console.warn(`Failed to get signed URL for ${n.final_pdf}:`, err?.message);
        }
      }),
    );

    // ============================================================
    // BUILD RESPONSE (no async per item)
    // ============================================================
    const data = naskahList.map((naskah) => {
      let penerimaSirkulasiList = (sirkulasiByNaskah.get(naskah.id) || []).filter(
        (s) => s.sirkuler === 'penerima',
      );

      if (userArea && userArea !== 'A000') {
        penerimaSirkulasiList = penerimaSirkulasiList.filter((s) => s.area === userArea);
      }

      // Pengirim eksternal
      let pengirimInfo: NdPengirimInfoDto = {
        id: '',
        nama: 'Eksternal',
        alamat: '',
        telepon: '',
        email: '',
        kontak: '',
      };
      if (naskah.tempat) {
        const eksternal = eksternalMap.get(naskah.tempat);
        if (eksternal) {
          pengirimInfo = this.toEksternalPengirimInfo(eksternal);
        }
      }

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

      // Tanggal
      let tanggalStr = '';
      if (naskah.tanggal) {
        tanggalStr =
          naskah.tanggal instanceof Date
            ? naskah.tanggal.toISOString().split('T')[0]
            : String(naskah.tanggal).split('T')[0];
      }

      // Jam UTC
      let jamUtc = '';
      if (naskah.createdAt) {
        const dateObj =
          naskah.createdAt instanceof Date ? naskah.createdAt : new Date(naskah.createdAt);
        jamUtc = dateObj.toISOString().split('T')[1].split('.')[0];
      }

      // Pembuat
      let pembuatInfo: NdPembuatInfoDto | null = null;
      if (naskah.createdByPosition) {
        const pembuatPos = positionMap.get(String(naskah.createdByPosition));
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

      const finalPdfUrl: string | null = finalPdfUrlMap.get(naskah.id) || null;
      const verifikators = verifikatorsByNaskah.get(naskah.id) || [];

      return {
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        jam: jamUtc,
        status: naskah.status,
        sifat: naskah.sifat,
        klasifikasi: naskah.klasifikasi,
        lampiran: naskah.lampiran,
        perihal: naskah.perihal,
        final_pdf: naskah.final_pdf,
        final_pdf_url: finalPdfUrl,
        pengirim: pengirimInfo,
        penerima: penerimaInfo,
        pembuat: pembuatInfo,
        verifikatorProgress: this.getVerifikatorProgress(verifikators),
        totalVerifikator: verifikators.length,
        verifikators: verifikators.map((verifikator) => this.toVerifikatorInfo(verifikator)),
      };
    });

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

    const verifikators = await this.verifikatorRepository.find({
      where: { idNaskah: id },
      order: { urutan: 'ASC' },
    });

    return {
      success: true,
      data: {
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        jam: jamUtc,
        status: naskah.status,
        sifat: naskah.sifat,
        klasifikasi: naskah.klasifikasi,
        lampiran: naskah.lampiran,
        perihal: naskah.perihal,
        final_pdf: naskah.final_pdf,
        final_pdf_url: finalPdfUrl,
        pengirim: pengirimInfo,
        penerima: penerimaInfo,
        pembuat: pembuatInfo,
        verifikatorProgress: this.getVerifikatorProgress(verifikators),
        totalVerifikator: verifikators.length,
        verifikators: verifikators.map((verifikator) => this.toVerifikatorInfo(verifikator)),
      },
    };
  }

  async updateMessage(
    id: string,
    dto: CreateNaskahDinasDto,
    file?: Express.Multer.File,
  ): Promise<NdGetDetailResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const naskah = await queryRunner.manager.findOne(NaskahEntity, {
        where: { id, jenis: 'SDE' },
      });

      if (!naskah || !naskah.tempat) {
        throw new NotFoundException(`Naskah Dinas dengan ID ${id} tidak ditemukan`);
      }

      let tanggal = new Date().toISOString().split('T')[0];
      if (dto.tanggal_surat) {
        if (dto.tanggal_surat.includes('.')) {
          const [day, month, year] = dto.tanggal_surat.split('.');
          tanggal = `${year}-${month}-${day}`;
        } else {
          tanggal = dto.tanggal_surat;
        }
      }

      const pengirimEksternal = await this.eksternalRepository.findOne({
        where: { id: dto.asal_naskah, aktif: true },
      });

      if (!pengirimEksternal) {
        throw new NotFoundException(
          `Asal naskah dengan ID ${dto.asal_naskah} tidak ditemukan atau tidak aktif`,
        );
      }

      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(`Data organisasi untuk tanggal ${tanggal} tidak ditemukan`);
      }

      const barisData: NdOrgDataPositionDto[] = orgData.position_json;
      const penerimaPositions: NdOrgDataPositionDto[] = [];

      for (const posId of dto.tertuju) {
        const position = barisData.find((p) => Number(p.position) === Number(posId));
        if (!position) {
          throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan`);
        }
        penerimaPositions.push(position);
      }

      let finalPdfPath = naskah.final_pdf || null;
      if (file) {
        const uploadResult = await this.storageService.uploadFile(file, 'naskah-dinas/final');
        finalPdfPath = uploadResult.key;
      }

      let tanggalNaskah = new Date();
      if (dto.tanggal_surat) {
        if (dto.tanggal_surat.includes('.')) {
          const [day, month, year] = dto.tanggal_surat.split('.');
          tanggalNaskah = new Date(`${year}-${month}-${day}`);
        } else {
          tanggalNaskah = new Date(dto.tanggal_surat);
        }
      }

      naskah.nomor = dto.nomor_asal || null;
      naskah.klasifikasi = dto.klasifikasi || '';
      naskah.sifat = this.normalizeSifat(dto.sifat_naskah);
      naskah.perihal = dto.perihal;
      naskah.lampiran = dto.lampiran || '';
      naskah.konten = dto.konten || '';
      naskah.final_pdf = finalPdfPath || '';
      naskah.tanggal = tanggalNaskah;
      naskah.tempat = dto.asal_naskah;
      naskah.createdByPosition = dto.created_by_position_id || naskah.createdByPosition;

      await queryRunner.manager.save(naskah);

      await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: id });
      await queryRunner.manager.save(this.createSirkulasiFromEksternal(id, pengirimEksternal));

      for (const pos of penerimaPositions) {
        await queryRunner.manager.save(this.createSirkulasiFromOrgData(id, 'penerima', pos));
      }

      await queryRunner.manager.delete(NaskahDinasVerifikatorEntity, { idNaskah: id });
      const verifikatorRows = this.createVerifikatorEntities(id, dto.verifikator || [], barisData);
      if (verifikatorRows.length > 0) {
        await queryRunner.manager.save(verifikatorRows);
      }

      await queryRunner.commitTransaction();

      return await this.getDetail(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getMyVerificationList(user: JwtPayload, filter: any = {}) {
    const page = Number(filter.page || 1);
    const limit = Number(filter.limit || 10);
    const skip = (page - 1) * limit;
    const persnum = Number(user.persnum);

    const queryBuilder = this.verifikatorRepository
      .createQueryBuilder('myVerifier')
      .innerJoinAndSelect('myVerifier.naskah', 'naskah')
      .where('myVerifier.persnum = :persnum', { persnum })
      .andWhere('naskah.jenis = :jenis', { jenis: 'SDE' })
      .andWhere('naskah.tempat IS NOT NULL')
      .orderBy('naskah.createdAt', 'DESC');

    if (filter.status && filter.status !== 'all') {
      queryBuilder.andWhere('myVerifier.status = :status', { status: filter.status });
    }

    if (filter.search) {
      queryBuilder.andWhere('(naskah.nomor LIKE :search OR naskah.perihal LIKE :search)', {
        search: `%${filter.search}%`,
      });
    }

    const [myVerifierRows, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
    const naskahIds = myVerifierRows.map((row) => row.idNaskah);

    const allVerifikators = naskahIds.length
      ? await this.verifikatorRepository.find({
          where: { idNaskah: In(naskahIds) },
          order: { urutan: 'ASC' },
        })
      : [];

    const verifikatorsByNaskah = new Map<string, NaskahDinasVerifikatorEntity[]>();
    for (const verifikator of allVerifikators) {
      if (!verifikatorsByNaskah.has(verifikator.idNaskah)) {
        verifikatorsByNaskah.set(verifikator.idNaskah, []);
      }
      verifikatorsByNaskah.get(verifikator.idNaskah)!.push(verifikator);
    }

    const tempatIds = myVerifierRows
      .map((row) => row.naskah?.tempat)
      .filter((tempat): tempat is string => !!tempat);
    const eksternalMap = new Map<string, EksternalEntity>();
    if (tempatIds.length > 0) {
      const eksternalList = await this.eksternalRepository.find({
        where: { id: In(Array.from(new Set(tempatIds))) },
      });
      for (const eksternal of eksternalList) {
        eksternalMap.set(eksternal.id, eksternal);
      }
    }

    const data = await Promise.all(
      myVerifierRows.map(async (row) => {
        const naskah = row.naskah;
        const verifikators = verifikatorsByNaskah.get(row.idNaskah) || [];
        const progress = this.getVerifikatorProgress(verifikators);
        const pengirim = naskah.tempat ? eksternalMap.get(naskah.tempat) : null;

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
          verifierId: row.id,
          tanggalDibuat: naskah.createdAt,
          tanggal: naskah.tanggal,
          nomor: naskah.nomor,
          perihal: naskah.perihal,
          status: progress.status,
          myVerifikatorStatus: row.status,
          canVerify: row.status === 'waiting',
          canReject: row.status === 'waiting',
          final_pdf: naskah.final_pdf,
          final_pdf_url: finalPdfUrl,
          pengirim: pengirim ? this.toEksternalPengirimInfo(pengirim) : null,
          verifikatorProgress: progress,
          totalVerifikator: verifikators.length,
          verifikators: verifikators.map((verifikator) => this.toVerifikatorInfo(verifikator)),
          myVerifikatorInfo: this.toVerifikatorInfo(row),
        };
      }),
    );

    const summary = await this.verifikatorRepository
      .createQueryBuilder('verifikator')
      .select([
        `SUM(CASE WHEN verifikator.status = 'waiting' THEN 1 ELSE 0 END) as totalWaiting`,
        `SUM(CASE WHEN verifikator.status = 'verified' THEN 1 ELSE 0 END) as totalVerified`,
        `SUM(CASE WHEN verifikator.status = 'rejected' THEN 1 ELSE 0 END) as totalRejected`,
        `COUNT(*) as total`,
      ])
      .where('verifikator.persnum = :persnum', { persnum })
      .getRawOne();

    return {
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalWaiting: parseInt(summary?.totalWaiting || '0', 10),
        totalVerified: parseInt(summary?.totalVerified || '0', 10),
        totalRejected: parseInt(summary?.totalRejected || '0', 10),
        total: parseInt(summary?.total || '0', 10),
      },
    };
  }

  async getVerificationDetail(id: string, user: JwtPayload) {
    const response = await this.getDetail(id);
    const myVerifikator = response.data.verifikators.find(
      (verifikator) => Number(verifikator.persnum) === Number(user.persnum),
    );

    if (!myVerifikator) {
      throw new ForbiddenException('Anda tidak terdaftar sebagai verifikator naskah ini');
    }

    return {
      ...response,
      data: {
        ...response.data,
        myVerifikatorInfo: myVerifikator,
        canVerify: myVerifikator.status === 'waiting',
        canReject: myVerifikator.status === 'waiting',
      },
    };
  }

  async verifyNaskah(id: string, user: JwtPayload, keterangan?: string) {
    const verifikators = await this.verifikatorRepository.find({
      where: { idNaskah: id },
      order: { urutan: 'ASC' },
    });

    if (verifikators.length === 0) {
      throw new NotFoundException('Naskah ini tidak memiliki verifikator');
    }

    const myVerifikator = verifikators.find(
      (verifikator) => Number(verifikator.persnum) === Number(user.persnum),
    );

    if (!myVerifikator) {
      throw new ForbiddenException('Anda tidak terdaftar sebagai verifikator naskah ini');
    }

    if (myVerifikator.status !== 'waiting') {
      if (myVerifikator.status === 'verified') {
        throw new BadRequestException('Anda sudah memverifikasi naskah ini');
      }
      if (myVerifikator.status === 'rejected') {
        throw new BadRequestException('Naskah ini sudah Anda tolak');
      }
      throw new BadRequestException('Belum giliran Anda untuk memverifikasi naskah ini');
    }

    myVerifikator.status = 'verified';
    myVerifikator.verifiedAt = new Date();
    myVerifikator.keterangan = keterangan || null;
    await this.verifikatorRepository.save(myVerifikator);

    const nextVerifikator = verifikators.find(
      (verifikator) =>
        verifikator.urutan > myVerifikator.urutan && verifikator.status === 'pending',
    );
    if (nextVerifikator) {
      nextVerifikator.status = 'waiting';
      await this.verifikatorRepository.save(nextVerifikator);
    }

    const refreshed = await this.verifikatorRepository.find({
      where: { idNaskah: id },
      order: { urutan: 'ASC' },
    });

    // Emit verifikator waiting count per-persnum ke semua user yang masih waiting
    try {
      const waitingRows = await this.verifikatorRepository
        .createQueryBuilder('v')
        .select('v.persnum', 'persnum')
        .addSelect('COUNT(*)', 'count')
        .where('v.status = :status', { status: 'waiting' })
        .groupBy('v.persnum')
        .getRawMany();
      for (const row of waitingRows) {
        this.realtimeEmitService.emitNaskahDinasVerifikatorCountUser(
          Number(row.persnum),
          Number(row.count),
        );
      }
      // User yang baru verify: count mereka = 0
      this.realtimeEmitService.emitNaskahDinasVerifikatorCountUser(Number(user.persnum), 0);
    } catch {}

    return {
      success: true,
      message: 'Naskah berhasil diverifikasi',
      data: {
        id,
        verifikatorProgress: this.getVerifikatorProgress(refreshed),
        verifikators: refreshed.map((verifikator) => this.toVerifikatorInfo(verifikator)),
      },
    };
  }

  async rejectNaskah(id: string, user: JwtPayload, alasan: string) {
    if (!alasan?.trim()) {
      throw new BadRequestException('Alasan penolakan wajib diisi');
    }

    const verifikators = await this.verifikatorRepository.find({
      where: { idNaskah: id },
      order: { urutan: 'ASC' },
    });

    if (verifikators.length === 0) {
      throw new NotFoundException('Naskah ini tidak memiliki verifikator');
    }

    const myVerifikator = verifikators.find(
      (verifikator) => Number(verifikator.persnum) === Number(user.persnum),
    );

    if (!myVerifikator) {
      throw new ForbiddenException('Anda tidak terdaftar sebagai verifikator naskah ini');
    }

    if (myVerifikator.status !== 'waiting') {
      if (myVerifikator.status === 'verified') {
        throw new BadRequestException('Anda sudah memverifikasi naskah ini, tidak dapat menolak');
      }
      if (myVerifikator.status === 'rejected') {
        throw new BadRequestException('Naskah ini sudah Anda tolak');
      }
      throw new BadRequestException('Belum giliran Anda untuk menolak naskah ini');
    }

    myVerifikator.status = 'rejected';
    myVerifikator.rejectedAt = new Date();
    myVerifikator.keterangan = alasan.trim();
    await this.verifikatorRepository.save(myVerifikator);

    const refreshed = await this.verifikatorRepository.find({
      where: { idNaskah: id },
      order: { urutan: 'ASC' },
    });

    // Emit verifikator waiting count per-persnum ke semua user yang masih waiting
    try {
      const waitingRows = await this.verifikatorRepository
        .createQueryBuilder('v')
        .select('v.persnum', 'persnum')
        .addSelect('COUNT(*)', 'count')
        .where('v.status = :status', { status: 'waiting' })
        .groupBy('v.persnum')
        .getRawMany();
      for (const row of waitingRows) {
        this.realtimeEmitService.emitNaskahDinasVerifikatorCountUser(
          Number(row.persnum),
          Number(row.count),
        );
      }
      // User yang baru reject: count mereka = 0
      this.realtimeEmitService.emitNaskahDinasVerifikatorCountUser(Number(user.persnum), 0);
    } catch {}

    return {
      success: true,
      message: 'Naskah berhasil ditolak',
      data: {
        id,
        verifikatorProgress: this.getVerifikatorProgress(refreshed),
        verifikators: refreshed.map((verifikator) => this.toVerifikatorInfo(verifikator)),
      },
    };
  }
}
