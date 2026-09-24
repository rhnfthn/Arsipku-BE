import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import * as path from 'path';
import * as fs from 'fs';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../../shared/entities/naskah_referensi.entity';
// REMOVED: SdiSdeEntity - fields now come from naskah_sirkulasi and naskah.tandaTangan
// import { SdiSdeEntity } from '../entities/sdi_sde.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import {
  SdeRecipientResponseDto,
  EksternalRecipientDto,
  SdeOrgDataPositionDto,
} from '../dto/sde-recipient-response.dto';
import {
  CreateSuratDinasEksternalDto,
  UpdateSdeDraftDto,
  FinalizeSdeDraftDto,
  SignOption,
} from '../dto/create-surat-dinas-eksternal.dto';
import {
  SdeSendMessageResponseDto,
  SdeSirkulasiInfoDto,
  SdePenerimaInfoDto,
} from '../dto/send-message-response.dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { StorageService } from '../../storage/services/storage.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import {
  DigsigService,
  type DigsigBatchContext,
} from '../../digsig/services/digsig.service';
import {
  QRCodeService,
  QRCodeData,
} from '../../digsig/services/qrcode.service';
import { KonsepService } from '../../konsep/services/konsep.service';
import {
  formatSignatureData,
  generateSignatureId,
} from '../../../common/helpers/signature.helper';
import { v4 as uuidv4 } from 'uuid';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { NotificationService } from '../../notification/services';
import { NaskahSirkulasiService } from '../../naskah-sirkulasi/services/naskah_sirkulasi.service';
import { assertDateNotInFuture } from '../../../common/helpers/date-validation.helper';
import { updatePartitionedNaskah } from '../../../common/helpers/naskah-partition.helper';
import { MailServiceService } from '../../mail-service/services/mail-service.service';
import { TteSigningGateway } from '../../tte-portal/services/tte-signing-gateway.service';
import { TteSigningService } from '../../tte-portal/services/tte-signing.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const COMPANY_ID = 10000; // PERUM LPPNPI
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN =
  'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';
const VERIFICATION_BASE_URL =
  process.env.VERIFICATION_URL ||
  'https://arsipku.airnavindonesia.co.id/verify';

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
    @InjectRepository(NaskahReferensiEntity)
    private readonly naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    // REMOVED: sdiSdeRepository - sdi_sde table no longer used
    // @InjectRepository(SdiSdeEntity)
    // private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
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
    private readonly nomorSuratService: NomorSuratService,
    private readonly storageService: StorageService,
    private readonly generatePdfSudinService: GeneratePdfSudinService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    private readonly digsigService: DigsigService,
    private readonly qrCodeService: QRCodeService,
    private readonly meilisearchSyncService: MeilisearchSyncService,
    private readonly notificationService: NotificationService,
    private readonly naskahSirkulasiService: NaskahSirkulasiService,
    private readonly mailServiceService: MailServiceService,
    private readonly konsepService: KonsepService,
    private readonly tteSigningGateway: TteSigningGateway,
    private readonly tteSigningService: TteSigningService,
  ) {}

  // ============================================================
  // HELPER: DATE UTILITIES (TIMEZONE-SAFE)
  // ============================================================

  /**
   * Helper: Parse date string "YYYY-MM-DD" to Date object with local timezone
   * Prevents timezone offset issues when parsing date strings
   */
  private parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Helper: Format Date object to "YYYY-MM-DD" string using local timezone
   * Prevents timezone offset issues when converting Date to string
   */
  private formatDateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ============================================================
  // HELPER: DYNAMIC HEADER INFO
  // ============================================================

  /**
   * Helper: Get dynamic header info dari sub_area_alamat berdasarkan user context
   * @param user - User context dengan company, area, subArea
   * @param tanggal - Optional date string YYYY-MM-DD untuk lookup
   * @returns Header info (kantor, gedung, alamat) atau null jika tidak ditemukan
   */
  async getHeaderInfoByUser(
    user: {
      company?: string | number;
      area?: string;
      subArea?: string;
    },
    tanggal?: string,
  ): Promise<{
    kantor: string;
    gedung: string;
    alamat: string;
    kota: string;
  } | null> {
    try {
      const company = String(user.company || COMPANY_ID);
      const area = user.area || '';
      const subArea = user.subArea || '';

      if (!area || !subArea) {
        console.log(
          '[SDE getHeaderInfoByUser] Missing area or subArea, using default',
        );
        return null;
      }

      const queryDate = tanggal ? this.parseDateString(tanggal) : new Date();

      const headerInfo =
        await this.subAreaAlamatService.findAlamatByUserContext(
          company,
          area,
          subArea,
          queryDate,
        );

      if (headerInfo) {
        console.log('[SDE getHeaderInfoByUser] Found header info:', headerInfo);
        return headerInfo;
      }

      console.log(
        '[SDE getHeaderInfoByUser] No header info found, using default',
      );
      return null;
    } catch (error) {
      console.error('[SDE getHeaderInfoByUser] Error:', error);
      return null;
    }
  }

  /**
   * Helper: Convert array of position IDs to position names
   * Uses org_data to lookup position information
   *
   * @param positionIds - Array of position IDs (can be string or number)
   * @param tanggal - Optional date for org_data lookup (default: today)
   * @returns Array of position text names
   */
  async convertPositionIdsToNames(
    positionIds: (string | number)[],
    tanggal?: string,
  ): Promise<string[]> {
    if (!positionIds || positionIds.length === 0) {
      return [];
    }

    // Get org_data for position lookup
    const tgl = tanggal || new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tgl);

    if (!orgData || !orgData.position_json) {
      return positionIds.map((id) => String(id)); // Fallback to IDs as strings
    }

    const barisData = orgData.position_json;
    const names: string[] = [];

    for (const posId of positionIds) {
      const numericId = typeof posId === 'string' ? parseInt(posId, 10) : posId;
      const position = barisData.find((p: any) => p.position === numericId);

      if (position) {
        // Return position_text only (without organization_text) - sama seperti SDI
        const fullName = `${position.position_text}`;
        names.push(fullName);
      } else {
        // Fallback if position not found
        names.push(String(posId));
      }
    }

    return names;
  }

  /**
   * Helper: Validate and get penerima eksternal entities
   * Skips empty/invalid IDs and returns found entities
   */
  private async validatePenerimaEksternal(
    penerimaIds: string[],
    throwOnNotFound: boolean = false,
  ): Promise<EksternalEntity[]> {
    const penerimaList: EksternalEntity[] = [];

    if (!penerimaIds || penerimaIds.length === 0) {
      return penerimaList;
    }

    console.log('🔍 Validating penerima eksternal:', penerimaIds);

    for (const eksternalId of penerimaIds) {
      // Skip empty values
      const cleanId = String(eksternalId).trim();
      if (
        !cleanId ||
        cleanId === '' ||
        cleanId === '[]' ||
        cleanId === 'undefined'
      ) {
        console.log('⚠️ Skipping invalid penerima ID:', eksternalId);
        continue;
      }

      console.log('🔍 Looking up eksternal ID:', cleanId);

      const eksternal = await this.eksternalRepository.findOne({
        where: { id: cleanId, aktif: true },
      });

      if (!eksternal) {
        console.log('❌ Eksternal not found:', cleanId);
        if (throwOnNotFound) {
          throw new NotFoundException(
            `Penerima eksternal dengan id ${cleanId} tidak ditemukan atau tidak aktif`,
          );
        }
        continue; // Skip if not throwing
      }

      console.log('✅ Eksternal found:', eksternal.nama);
      penerimaList.push(eksternal);
    }

    return penerimaList;
  }

  /**
   * Helper: Convert array of eksternal UUIDs to company names
   * Uses eksternal table to lookup company information
   *
   * @param eksternalIds - Array of eksternal UUIDs
   * @returns Array of company names
   */
  async convertEksternalIdsToNames(eksternalIds: string[]): Promise<string[]> {
    if (!eksternalIds || eksternalIds.length === 0) {
      return [];
    }

    const names: string[] = [];

    for (const extId of eksternalIds) {
      const cleanId = String(extId).trim();

      // Check if it's a UUID (contains dashes)
      const isUuid = cleanId.includes('-') && cleanId.length === 36;

      if (isUuid) {
        const eksternal = await this.eksternalRepository.findOne({
          where: { id: cleanId, aktif: true },
        });

        if (eksternal) {
          names.push(eksternal.nama);
        } else {
          // Fallback to ID if not found
          names.push(cleanId);
        }
      } else {
        // Not a UUID, just return as is (might be a name already)
        names.push(cleanId);
      }
    }

    return names;
  }

  // ============================================================
  // PDF GENERATION
  // ============================================================

  /**
   * Generate PDF dari HTML content untuk Surat Dinas Eksternal
   * Menggunakan Puppeteer di backend untuk render HTML
   * Support temporary lampiran system (lampiran_temp_ids)
   */
  async generatePdfFromHtml(
    htmlContent: string,
    penerima: string[],
    namaTempat: string = 'Tangerang',
    tanggal: string = '',
    namaJabatan: string = '',
    namaLengkap: string = '',
    tembusan: string[] = [],
    lampiranTempIds?: string[],
    perihal: string = '',
    sifat: string = 'Biasa',
    nomor: string = '',
    lampiran: string = '-',
    headerInfo?: { kantor: string; gedung: string; alamat: string },
    english: boolean = false,
    atasNama: string = '',
    lampiranDirectRefs: Array<{ fileName: string; key: string }> = [],
  ): Promise<Buffer> {
    try {
      // Determine lampiran text: use file names from lampiran_temp_ids if available
      let lampiranText = lampiran;
      let lampiranFiles: any[] = [];

      if (lampiranTempIds && lampiranTempIds.length > 0) {
        lampiranFiles = await this.getTemporaryLampiranFiles(lampiranTempIds);
        if (lampiranFiles && lampiranFiles.length > 0) {
          // Auto-fill lampiran field with count format (e.g., "1 Lampiran", "2 Lampiran" or "1 Attachment")
          const count = lampiranFiles.length;
          lampiranText = english
            ? `${count} Attachment${count > 1 ? 's' : ''}`
            : `${count} Lampiran`;
        }
      }

      if (lampiranDirectRefs && lampiranDirectRefs.length > 0) {
        lampiranFiles = [
          ...lampiranFiles,
          ...lampiranDirectRefs.map((ref) => ({
            fileName: ref.fileName,
            filePath: ref.key,
          })),
        ];
        if (lampiranFiles.length > 0) {
          lampiranText = english
            ? `${lampiranFiles.length} Attachment${lampiranFiles.length > 1 ? 's' : ''}`
            : `${lampiranFiles.length} Lampiran`;
        }
      }

      // Generate preview QR code untuk preview PDF
      const previewQrHtml =
        await this.qrCodeService.generatePreviewQRCodeHtml();

      const htmlBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64');
      let pdfBuffer = await this.generatePdfSudinService.generatePdf({
        html: htmlBase64,
        penerima: penerima,
        nama_tempat: namaTempat,
        tanggal: tanggal,
        positionText: namaJabatan,
        namaLengkap: namaLengkap,
        atasNama: atasNama || null,
        tembusan: tembusan,
        perihal: perihal,
        sifat: sifat,
        nomor: nomor,
        lampiran: lampiranText,
        // Dynamic header info dari sub_area_alamat
        headerKantor: headerInfo?.kantor,
        headerGedung: headerInfo?.gedung,
        headerAlamat: headerInfo?.alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
        // English format flag
        english: english,
      });

      // If lampiran files exist, merge with main PDF
      if (lampiranFiles && lampiranFiles.length > 0) {
        pdfBuffer = await this.mergePdfWithTemporaryFiles(
          pdfBuffer,
          lampiranFiles,
        );
      }

      return pdfBuffer;
    } catch (error) {
      throw new BadRequestException(`Gagal generate PDF: ${error.message}`);
    }
  }

  /**
   * Get lampiran files from storage (both temporary and final)
   * Query by lampiran IDs - supports both is_temporary=1 (before save-draft)
   * and is_temporary=0 (after save-draft)
   */
  private async getTemporaryLampiranFiles(tempIds: string[]): Promise<any[]> {
    try {
      if (!tempIds || tempIds.length === 0) {
        return [];
      }

      // Query all lampiran by IDs (both temporary and final)
      // This allows preview-pdf to work both before and after save-draft
      const tempLampiran = await this.naskahLampiranRepository.find({
        where: {
          id: In(tempIds),
          // Removed is_temporary: 1 filter to support both temporary and final lampiran
        },
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
   * Merge main PDF dengan temporary lampiran files
   */
  private async mergePdfWithTemporaryFiles(
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
   * Move temporary lampiran to final location and link to naskah
   * Update: is_temporary = 0, id_naskah = naskahId, move file to final folder
   *
   * @param lampiranIds - Array of lampiran IDs (temporary)
   * @param naskahId - ID naskah yang akan dikaitkan
   * @param finalFolder - Folder tujuan (e.g., 'surat-dinas-eksternal/lampiran')
   */
  private async moveTemporaryLampiranToFinal(
    lampiranIds: string[],
    naskahId: string,
    finalFolder: string,
  ): Promise<void> {
    if (!lampiranIds || lampiranIds.length === 0) {
      return;
    }

    console.log(
      `[SDE moveTemporaryLampiranToFinal] Looking for IDs:`,
      lampiranIds,
    );

    // Get all temporary lampiran
    const tempLampiran = await this.naskahLampiranRepository.find({
      where: {
        id: In(lampiranIds),
        is_temporary: 1,
      },
    });

    console.log(
      `[SDE moveTemporaryLampiranToFinal] Found ${tempLampiran.length} temporary lampiran`,
    );

    if (tempLampiran.length === 0) {
      // Kemungkinan lampiran sudah difinalisasi (is_temporary=0) dari save sebelumnya.
      // Cek apakah ID-nya ada di database (sudah final) — kalau ya, skip saja.
      const existingLampiran = await this.naskahLampiranRepository.find({
        where: { id: In(lampiranIds) },
      });
      if (existingLampiran.length > 0) {
        console.log(
          `[SDE moveTemporaryLampiranToFinal] ${existingLampiran.length} lampiran sudah final, skip.`,
        );
        return;
      }
      throw new NotFoundException('Lampiran temporary tidak ditemukan');
    }

    // Validate all lampiran are temporary (prevent reuse)
    if (tempLampiran.length !== lampiranIds.length) {
      throw new BadRequestException(
        'Beberapa lampiran ID tidak valid atau bukan temporary (sudah digunakan sebelumnya)',
      );
    }

    // Kunci partisi: sinkronkan tanggal lampiran ke tanggal naskah induk
    // supaya lampiran final berada di partisi tahun yang sama dengan naskah.
    const parentNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    // Move each file and update database
    for (const lampiran of tempLampiran) {
      const fileName = lampiran.file_name;
      const oldKey = lampiran.file_pdf;

      // Generate new key untuk final location
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const newKey = `${finalFolder}/${timestamp}-${sanitizedFileName}`;

      try {
        // Move file di storage
        await this.storageService.moveFile(oldKey, newKey);

        // Update database
        lampiran.id_naskah = naskahId;
        lampiran.file_pdf = newKey;
        lampiran.jenis = 'SDE';
        lampiran.is_temporary = 0;
        lampiran.temp_folder_id = null;
        lampiran.tanggal = parentNaskah?.tanggal ?? lampiran.tanggal;

        await this.naskahLampiranRepository.save(lampiran);
      } catch (error) {
        // Continue with other files
      }
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Helper: Convert bulan ke Romawi
   */
  private getBulanRomawi(bulan: number): string {
    const mapping: Record<number, string> = {
      1: 'I',
      2: 'II',
      3: 'III',
      4: 'IV',
      5: 'V',
      6: 'VI',
      7: 'VII',
      8: 'VIII',
      9: 'IX',
      10: 'X',
      11: 'XI',
      12: 'XII',
    };
    return mapping[bulan] || 'I';
  }

  /**
   * Helper: Extract last 2 characters dari area code
   */
  private extractAreaCode(area: string | null | undefined): string {
    if (!area) return '';
    if (area.length >= 2) {
      return area.slice(-2);
    }
    return area.padStart(2, '0');
  }

  /**
   * Helper: Generate nomor SDE dengan integrasi ke nomor_request dan nomor_request_detail
   * Menggunakan format dari tabel jenis dan update counter di tabel nomor
   * Auto-insert ke nomor_request dan nomor_request_detail dengan status 'terpakai'
   * SDE menggunakan area-based counter (sama seperti SDI)
   *
   * @param pengirim - Data pengirim dari org_data
   * @param klasifikasi - Kode klasifikasi arsip
   * @param perihal - Perihal surat
   * @param tanggal - Tanggal surat
   * @param queryRunner - Query runner untuk transaction
   * @returns Nomor surat yang sudah di-generate
   */
  private async generateNomorWithIntegration(
    pengirim: SdeOrgDataPositionDto,
    klasifikasi: string,
    perihal: string,
    tanggal: Date,
    queryRunner: any,
    finalPdfKey?: string,
    finalPdfFileName?: string,
  ): Promise<string> {
    const jenis = 'SDE';
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
      isNaskahGenerated: true,
    });

    await queryRunner.manager.save(nomorRequest);

    // 3. Query nomor terakhir dengan locking (SDE menggunakan Company + Area, seperti SDI)
    const nomorRecord = await queryRunner.manager
      .createQueryBuilder(NomorEntity, 'n')
      .where('n.tahun = :tahun', { tahun })
      .andWhere('n.jenis = :jenis', { jenis })
      .andWhere('n.company = :company', { company: nomorRequest.company })
      .andWhere('n.area = :area', { area: nomorRequest.area })
      .setLock('pessimistic_write')
      .getOne();

    // 4. Generate nomor urut baru
    let noUrut = 1;
    if (nomorRecord && nomorRecord.nomor) {
      noUrut = nomorRecord.nomor + 1;
    }

    // 5. Generate nomor lengkap dari format (dibaca dari tabel jenis)
    const noUrutFormatted = noUrut.toString().padStart(3, '0');
    const bulanRomawi = this.getBulanRomawi(bulan);
    const jabatanCode = pengirim.position_abbreviation || '';
    const lokasiCode = this.extractAreaCode(pengirim.area);
    const instansi = 'LPPNPI'; // Default instansi

    let nomorLengkap = jenisData.formatPenomoran
      .replace(/{TIPE}/g, jenis)
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, klasifikasi || '')
      .replace(/{BULAN}/g, bulanRomawi)
      .replace(/{TAHUN}/g, tahun.toString());

    // Clean up extra spaces
    nomorLengkap = nomorLengkap
      .replace(/\/\s+/g, '/')
      .replace(/\s+\//g, '/')
      .replace(/\/\//g, '/')
      .trim();

    // 6. Insert atau update nomor di tabel nomor
    if (nomorRecord) {
      nomorRecord.nomor = noUrut;
      await queryRunner.manager.save(nomorRecord);
    } else {
      const newNomor = this.nomorRepository.create({
        id: uuidv4(),
        company: nomorRequest.company,
        area: nomorRequest.area,
        subArea: nomorRequest.subArea,
        organization: nomorRequest.organization,
        position: nomorRequest.position,
        tahun: tahun,
        jenis: jenis,
        nomor: noUrut,
      });
      await queryRunner.manager.save(newNomor);
    }

    // 7. Insert nomor_request_detail dengan status 'terpakai_final' (langsung dari SDE)
    const nomorRequestDetail = this.nomorRequestDetailRepository.create({
      id: uuidv4(),
      idRequest: requestId,
      nomor: nomorLengkap,
      fileName: finalPdfFileName || null,
      fileText: finalPdfKey || null,
      status: 'terpakai_final',
    });

    await queryRunner.manager.save(nomorRequestDetail);

    return nomorLengkap;
  }

  /**
   * Reservasi nomor untuk SDE Massal dalam satu transaksi singkat.
   *
   * Finalisasi biasa menahan lock counter nomor sampai PDF dan BSrE selesai.
   * Jika banyak naskah dijalankan paralel, transaksi lain dapat timeout saat
   * menunggu lock yang sama. Reservasi di awal membuat lock segera dilepas,
   * lalu pekerjaan PDF/signing aman dijalankan secara paralel.
   */
  async reserveMassalNumbers(
    requests: Array<{
      pengirim: number;
      tgl?: string;
      klasifikasi?: string;
      perihal?: string;
    }>,
  ): Promise<string[]> {
    if (requests.length === 0) return [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const orgDataByDate = new Map<string, SdeOrgDataPositionDto[]>();
      const numbers: string[] = [];

      for (const request of requests) {
        const tanggal = request.tgl
          ? this.parseDateString(request.tgl)
          : new Date();
        const dateKey = request.tgl || tanggal.toISOString().slice(0, 10);

        let positions = orgDataByDate.get(dateKey);
        if (!positions) {
          const orgData = await this.orgDataService.findOrg(dateKey);
          if (!orgData?.position_json) {
            throw new NotFoundException(
              `Data organisasi untuk tanggal ${dateKey} tidak ditemukan`,
            );
          }
          const loadedPositions: SdeOrgDataPositionDto[] =
            orgData.position_json;
          positions = loadedPositions;
          orgDataByDate.set(dateKey, loadedPositions);
        }

        const pengirim = positions.find(
          (position) => Number(position.position) === Number(request.pengirim),
        );
        if (!pengirim || pengirim.chief !== 1) {
          throw new ForbiddenException(
            'Penandatangan tidak ditemukan atau bukan pejabat managerial aktif',
          );
        }

        numbers.push(
          await this.generateNomorWithIntegration(
            pengirim,
            request.klasifikasi || '',
            request.perihal || '-',
            tanggal,
            queryRunner,
          ),
        );
      }

      await queryRunner.commitTransaction();
      return numbers;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** Ambil identitas BSrE sekali untuk dipakai seluruh item satu batch. */
  getBsreUserDataForMassal(_persnum: number): { nik: string; no_wa: string } {
    return this.digsigService.getUserDataForMassalBsre();
  }

  /**
   * Helper: Convert SdeOrgDataPositionDto to SdeSirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: SdeOrgDataPositionDto): SdeSirkulasiInfoDto {
    return {
      position: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum_person ?? pos.persnum ?? null,
      nama: pos.persnum_person_text ?? pos.nama ?? null,
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
  private async createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'pengirim' | 'tembusan',
    pos: SdeOrgDataPositionDto,
    isDraft: boolean = false,
    urutan: number = 0,
  ): Promise<NaskahSirkulasi> {
    let tanggal: Date = new Date();
    if (idNaskah) {
      const parentNaskah = await this.naskahRepository.findOne({
        where: { id: idNaskah },
        select: { tanggal: true },
      });
      tanggal = parentNaskah?.tanggal ?? new Date();
    }
    const sirkulasi = this.naskahSirkulasiRepository.create({
      id: uuidv4(),
      idNaskah,
      tanggal,
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
      idSirkuler: String(
        pos.persnum_person ?? pos.persnum ?? pos.position ?? '',
      ),
      namaSirkuler:
        pos.persnum_person_text ?? pos.nama ?? pos.position_text ?? '',
      isDraft: isDraft,
      urutan: urutan,
    });

    return sirkulasi;
  }

  /**
   * Helper: Create NaskahSirkulasi record from EksternalEntity
   * For penerima eksternal - stores external recipient data with urutan
   */
  private async createSirkulasiFromEksternal(
    naskahId: string,
    eksternal: EksternalEntity,
    isDraft: boolean = false,
    urutan: number = 0,
  ): Promise<NaskahSirkulasi> {
    let tanggal: Date = new Date();
    if (naskahId) {
      const parentNaskah = await this.naskahRepository.findOne({
        where: { id: naskahId },
        select: { tanggal: true },
      });
      tanggal = parentNaskah?.tanggal ?? new Date();
    }
    const sirkulasi = this.naskahSirkulasiRepository.create({
      id: uuidv4(),
      idNaskah: naskahId,
      tanggal,
      sirkuler: 'penerima',
      company: null, // Penerima eksternal tidak punya company internal
      companyText: eksternal.nama, // Gunakan nama sebagai company text
      area: null,
      areaText: null,
      subArea: null,
      subAreaText: null,
      organization: null,
      organizationText: eksternal.nama, // Nama penerima eksternal
      position: null,
      positionText: null,
      positionStatus: 'ext', // Mark as external
      idSirkuler: eksternal.id, // ID dari tabel eksternal
      namaSirkuler: eksternal.nama, // Nama dari tabel eksternal
      alamat: eksternal.alamat || null,
      telepon: eksternal.telepon || null,
      email: eksternal.email || null,
      isDraft: isDraft,
      urutan: urutan,
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
   * - Pengirim: dari org_data (positionId)
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

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // Find sender's position data
    const sender = barisData.find(
      (x) => Number(x.position) === Number(positionId),
    );

    if (!sender) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`,
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

  async getSenderKonsep(
    positionId: number,
    tgl?: string,
    parentNaskahId?: string,
  ): Promise<SdeOrgDataPositionDto[]> {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const data: SdeOrgDataPositionDto[] = orgData.position_json;

    // Jika SDE Massal dibuat dari disposisi, pengirim hanya boleh diambil
    // dari rantai disposisi tersebut. Jangan mencampur dengan seluruh pejabat
    // managerial karena bisa memasukkan pejabat dari divisi lain.
    if (parentNaskahId) {
      return this.getSendersFromDispositionChain(
        parentNaskahId,
        positionId,
        data,
      );
    }

    const result: SdeOrgDataPositionDto[] = [];
    const added = new Set<number>();

    const pushUnique = (item?: SdeOrgDataPositionDto) => {
      if (!item) return;
      const key = Number(item.position);
      if (added.has(key)) return;
      added.add(key);
      result.push(item);
    };

    let current = data.find((x) => Number(x.position) === Number(positionId));
    if (!current) return result;

    const bods = ['BOD', 'BOD-1'];

    if (current.chief === 0) {
      const chiefs = data.filter(
        (x) =>
          Number(x.divisi_id) === Number(current!.divisi_id) &&
          x.chief === 1 &&
          bods.includes(x.bod_tag as string),
      );

      chiefs.forEach(pushUnique);
      current = chiefs.find((x) => x.bod_tag === 'BOD-1');
    }

    while (current) {
      if (bods.includes(current.bod_tag as string)) {
        pushUnique(current);
      }

      const parent = data.find(
        (x) =>
          Number(x.organization_id) === Number(current!.organization_parent) &&
          x.chief === 1 &&
          x.sub_area === current?.sub_area,
      );

      if (!parent) break;
      current = parent;
    }

    // Urutan pengirim: EVP → Direktur (Teknik/dll) → Direktur Utama.
    // EVP (BOD-1) adalah level terendah yang layak jadi pengirim, Direktur
    // Utama paling atas. Sort by rank, bukan level tree (level tree justru
    // menaruh Direktur di atas EVP).
    const rankOf = (x: SdeOrgDataPositionDto): number => {
      const text = String(x.position_text || '').toLowerCase();
      if (text.includes('direktur utama')) return 2;
      if (String(x.bod_tag || '').toUpperCase() === 'BOD') return 1;
      return 0; // EVP (BOD-1) dan lainnya
    };
    result.sort((a, b) => rankOf(a) - rankOf(b));
    return result;
  }

  /**
   * Ambil kandidat pengirim dari chain disposisi awal.
   * Chain dibaca dari disposisi aktif menuju root, sehingga kandidat pertama
   * adalah pejabat yang paling dekat di atas user, lalu dilanjutkan pejabat
   * yang lebih tinggi. Semua kandidat wajib berada pada divisi/company yang
   * sama dengan posisi user.
   */
  private async getSendersFromDispositionChain(
    parentNaskahId: string,
    positionId: number,
    positions: SdeOrgDataPositionDto[],
  ): Promise<SdeOrgDataPositionDto[]> {
    const parent = await this.naskahRepository.findOne({
      where: { id: parentNaskahId },
    });
    if (!parent || parent.jenis !== 'DI') return [];

    const chain: Array<{
      sender: NaskahSirkulasi;
      recipients: NaskahSirkulasi[];
    }> = [];
    const visited = new Set<string>();
    let currentId: string | null = parentNaskahId;

    // Mulai dari naskah yang sedang diterima user, lalu berjalan ke disposisi
    // awal melalui naskah_referensi.ref_nomor.
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const sender = await this.naskahSirkulasiRepository.findOne({
        where: { idNaskah: currentId, sirkuler: 'pengirim' },
      });
      const recipients = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: currentId,
          sirkuler: In(['penerima', 'tembusan']),
        },
        order: { urutan: 'ASC', createdAt: 'ASC' },
      });

      if (sender) chain.push({ sender, recipients });

      const reference = await this.naskahReferensiRepository.findOne({
        where: { id_naskah: currentId },
      });
      if (!reference?.ref_nomor) break;

      const previous = await this.naskahRepository.findOne({
        where: { nomor: reference.ref_nomor, jenis: 'DI' },
      });
      currentId = previous?.id ?? null;
    }

    // Pastikan caller memang penerima di chain ini. Ini juga mencegah endpoint
    // dipakai untuk membaca kandidat pengirim dari disposisi milik akun lain.
    const currentPosition = String(positionId);
    const isInChain = chain.some(({ recipients }) =>
      recipients.some((recipient) => String(recipient.position) === currentPosition),
    );
    if (!isInChain) return [];

    const current = positions.find(
      (position) => String(position.position) === currentPosition,
    );
    const currentDivision = this.getPositionScope(current);
    const added = new Set<string>();
    const result: SdeOrgDataPositionDto[] = [];

    const addCandidate = (candidate?: SdeOrgDataPositionDto) => {
      if (!candidate || Number(candidate.chief) !== 1) return;
      const candidatePosition = String(candidate.position ?? '').trim();
      if (!candidatePosition || candidatePosition === currentPosition) return;
      if (added.has(candidatePosition)) return;
      added.add(candidatePosition);
      result.push(candidate);
    };

    // chain tersimpan current -> root, sesuai kebutuhan: atasan langsung
    // tampil lebih dulu daripada pejabat yang levelnya lebih tinggi.
    for (const { sender } of chain) {
      const senderPosition = String(sender.position ?? '').trim();
      if (!senderPosition || senderPosition === currentPosition) continue;
      if (added.has(senderPosition)) continue;

      const master = positions.find(
        (position) => String(position.position) === senderPosition,
      );
      if (!master || Number(master.chief) !== 1) continue;
      const senderScope = this.getPositionScope(master);
      const isHigherDirector = this.isDirectorLevel(master.position_text);
      const sameCompany =
        currentDivision &&
        senderScope &&
        currentDivision.company === senderScope.company;
      // Atasan managerial biasa wajib satu divisi. Direktur di atas Made
      // (mis. Direktur Teknik dan Direktur Utama) tetap ikut jika muncul pada
      // chain awal, karena jenjangnya memang berada di atas batas divisi.
      if (
        !this.isSamePositionScope(currentDivision, senderScope) &&
        !(isHigherDirector && sameCompany)
      ) {
        continue;
      }

      addCandidate(master);
    }

    // Chain disposisi bisa berhenti di EVP Made, sementara Direktur Teknik
    // dan Direktur Utama tidak selalu tercatat sebagai pengirim disposisi.
    // Ambil Direktur dari direktorat pejabat tertinggi pada chain, kemudian
    // ambil Direktur Utama dari company yang sama.
    const chainAnchor = [...chain]
      .reverse()
      .map(({ sender }) =>
        positions.find(
          (position) =>
            String(position.position) === String(sender.position ?? '').trim(),
        ),
      )
      .find((position) => position?.direktorat_id);
    const anchor = chainAnchor || current;
    const directorateId = Number(anchor?.direktorat_id ?? 0);
    const companyId = String(anchor?.company ?? current?.company ?? '').trim();

    if (directorateId > 0 && companyId) {
      positions
        .filter(
          (position) =>
            String(position.company ?? '').trim() === companyId &&
            Number(position.direktorat_id ?? 0) === directorateId &&
            this.isDirectorLevel(position.position_text) &&
            !this.isDirekturUtama(position.position_text),
        )
        .sort((a, b) => String(a.position_text).localeCompare(String(b.position_text)))
        .forEach((position) => addCandidate(position));
    }

    positions
      .filter(
        (position) =>
          String(position.company ?? '').trim() === companyId &&
          this.isDirekturUtama(position.position_text),
      )
      .forEach((position) => addCandidate(position));

    // Dropdown pengirim menampilkan hierarki dari jabatan tertinggi ke
    // atasan terdekat agar Direktur Utama selalu berada paling atas.
    return result.reverse();
  }

  private getPositionScope(position?: SdeOrgDataPositionDto): {
    company: string;
    division: string;
  } | null {
    if (!position) return null;
    const company = String(position.company ?? '').trim();
    const divisionValue = position.divisi_id || position.organization_id;
    const division = String(divisionValue ?? '').trim();
    if (!company || !division || division === '0') return null;
    return { company, division };
  }

  private isSamePositionScope(
    current: { company: string; division: string } | null,
    candidate: { company: string; division: string } | null,
  ): boolean {
    // Bila snapshot organisasi tidak lengkap, chain tetap menjadi sumber
    // kebenaran. Jika metadata tersedia, company dan divisi harus sama.
    if (!current || !candidate) return !current;
    return current.company === candidate.company && current.division === candidate.division;
  }

  private isDirectorLevel(value: unknown): boolean {
    return /\bDIREKTUR\b|\bDIRUT\b|\bDIRECTOR\b/i.test(String(value ?? ''));
  }

  private isDirekturUtama(value: unknown): boolean {
    return /DIREKTUR\s+UTAMA|PRESIDENT\s+DIRECTOR|\bDIRUT\b/i.test(
      String(value ?? ''),
    );
  }

  /**
   * Get tembusan (CC) recipients for SDE using org_data
   * Tembusan are internal positions with same logic as SDI
   *
   * SDE Tembusan Rules:
   * - Hanya REKAN managerial (chief=1)
   * - Sama company
   * - bod_tag='BOD' (eksekutif level)
   * - Bukan pengirim (diri sendiri)
   *
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date (default: today)
   * @returns SdeTembusanResponseDto
   */
  async getSdeTembusan(positionId: number, tgl?: string): Promise<any> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // Find sender's position data
    const sender = barisData.find(
      (x) => Number(x.position) === Number(positionId),
    );

    if (!sender) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`,
      );
    }

    // Verify sender is chief (managerial)
    if (sender.chief !== 1) {
      throw new ForbiddenException(
        `Position ${positionId} bukan managerial (chief). Hanya managerial yang dapat mengirim Surat Dinas Eksternal.`,
      );
    }

    // Filter tembusan using same logic as SDI
    // Tembusan: chief=1, bod_tag='BOD', same company, bukan diri sendiri
    const tembusan = barisData.filter(
      (x) =>
        x.chief === 1 &&
        x.bod_tag === 'BOD' &&
        x.company === sender.company &&
        Number(x.position) !== Number(positionId),
    );

    return {
      sender,
      tembusan,
      totalTembusan: tembusan.length,
    };
  }

  // ============================================================
  // FORM DATA PARSING
  // ============================================================

  /**
   * Parse form-data body to FinalizeSdeDraftDto
   * All fields optional for finalize draft
   */
  async parseFormDataToFinalizeDraftDto(
    body: any,
  ): Promise<FinalizeSdeDraftDto> {
    // Helper: Parse string array (for penerima - array of eksternal IDs or position IDs)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Helper: Parse number array (for tembusan - array of position IDs)
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

    // Build DTO (all fields optional)
    const dto: FinalizeSdeDraftDto = {};

    // Sirkulasi
    if (body.pengirim !== undefined) dto.pengirim = Number(body.pengirim);
    if (body.penerima !== undefined)
      dto.penerima = parseStringArray(body.penerima);
    if (body.tembusan !== undefined)
      dto.tembusan = parseNumberArray(body.tembusan);

    // Kop
    if (body.kop_logo !== undefined) dto.kop_logo = body.kop_logo;
    if (body.kop_nama !== undefined) dto.kop_nama = body.kop_nama;
    if (body.alamat_perusahaan !== undefined)
      dto.alamat_perusahaan = body.alamat_perusahaan;

    // Data Naskah
    if (body.klasifikasi !== undefined) dto.klasifikasi = body.klasifikasi;
    if (body.klasifikasi_text !== undefined)
      dto.klasifikasi_text = body.klasifikasi_text;
    if (body.sifat !== undefined) dto.sifat = body.sifat;
    if (body.perihal !== undefined) dto.perihal = body.perihal;
    if (body.konten !== undefined) dto.konten = body.konten;
    if (body.english !== undefined)
      dto.english = body.english === 'true' || body.english === true;

    // Kaki
    if (body.nama_tempat !== undefined) dto.nama_tempat = body.nama_tempat;
    if (body.nama_jabatan !== undefined) dto.nama_jabatan = body.nama_jabatan;
    if (body.tanda_tangan !== undefined) dto.tanda_tangan = body.tanda_tangan;
    if (body.nama_lengkap !== undefined) dto.nama_lengkap = body.nama_lengkap;

    // Lampiran
    if (body.lampiran !== undefined) dto.lampiran = body.lampiran;
    if (body.lampiran_temp_ids !== undefined) {
      dto.lampiran_temp_ids = parseStringArray(body.lampiran_temp_ids);
    }
    if (body.lampiran_files !== undefined) {
      dto.lampiran_files = parseStringArray(body.lampiran_files);
    }

    // Tanggal
    if (body.tgl !== undefined) dto.tgl = body.tgl;

    // Digital Signature Options
    if (body.sign_option !== undefined) dto.sign_option = body.sign_option;
    if (body.passphrase !== undefined) dto.passphrase = body.passphrase;

    return dto;
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
    status: 'draf' | 'pending' | 'final' | 'final_tte',
  ): Promise<SdeSendMessageResponseDto> {
    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

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
    const pengirim = barisData.find(
      (x) => Number(x.position) === Number(dto.pengirim),
    );
    if (!pengirim) {
      throw new NotFoundException(
        `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
      );
    }
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(
        `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`,
      );
    }

    // PHASE 3: Validate penerima dari tabel eksternal (optional - bisa kosong)
    // Support both:
    // - UUID (id dari tabel eksternal) - untuk string UUID
    // - Position ID (id_position_pembuat) - untuk angka/number
    const penerimaList: EksternalEntity[] = [];

    if (dto.penerima && dto.penerima.length > 0) {
      for (const penerimaValue of dto.penerima) {
        // Trim whitespace from value
        const cleanValue = String(penerimaValue).trim();

        // Check if it's a UUID (contains dashes and is 36 chars) or a number (position ID)
        const isUuid = cleanValue.includes('-') && cleanValue.length === 36;

        let eksternal: EksternalEntity | null = null;

        if (isUuid) {
          // Search by eksternal.id (UUID)
          eksternal = await this.eksternalRepository.findOne({
            where: { id: cleanValue, aktif: true },
          });
        } else {
          // Search by id_position_pembuat (position ID)
          eksternal = await this.eksternalRepository.findOne({
            where: { id_position_pembuat: cleanValue, aktif: true },
          });
        }

        if (!eksternal) {
          continue; // Skip instead of throwing error to be more lenient
        }

        // Avoid duplicates
        if (!penerimaList.find((p) => p.id === eksternal.id)) {
          penerimaList.push(eksternal);
        }
      }
    }

    // PHASE 3.1: Validate and get tembusan from org_data (if any)
    const tembusanList: SdeOrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find(
          (x) => Number(x.position) === Number(posId),
        );
        if (tembusan) {
          tembusanList.push(tembusan);
        }
      }
    }

    // Garis Kewenangan (a.n.): pemberi kuasa auto-tembusan (force, tidak bisa hapus).
    // Hanya untuk non-Dirut (atas_nama_position_id diisi). Dirut "a.n Direksi" tidak CC.
    if (dto.atas_nama_position_id) {
      const atasNamaPos = barisData.find(
        (x) => Number(x.position) === Number(dto.atas_nama_position_id),
      );
      if (
        atasNamaPos &&
        !tembusanList.some(
          (t) => Number(t.position) === Number(dto.atas_nama_position_id),
        )
      ) {
        tembusanList.push(atasNamaPos);
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let nomorSurat: string;

    try {
      // PHASE 4: Generate nomor surat (only for final/final_tte, draft gets temporary nomor)
      if (status === 'draf') {
        nomorSurat = `DRAFT-${Date.now()}`;
      } else {
        const tanggalNomor = dto.tgl
          ? this.parseDateString(dto.tgl)
          : new Date();
        nomorSurat = await this.generateNomorWithIntegration(
          pengirim,
          dto.klasifikasi,
          dto.perihal,
          tanggalNomor,
          queryRunner,
        );
      }

      // PHASE 5: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = dto.tgl
        ? this.parseDateString(dto.tgl)
        : new Date();
      const renderedKonten = (dto.konten || '')
        .replace(/\{\{\s*nomor_surat\s*\}\}/gi, nomorSurat)
        .replace(
          /\{\{\s*tanggal_surat\s*\}\}/gi,
          tanggalHariIni.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        )
        .replace(/\{\{\s*sifat_surat\s*\}\}/gi, dto.sifat || 'biasa');

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
        konten: renderedKonten,
        tempat: dto.nama_tempat || undefined,
        status: status,
        signOption: dto.sign_option || null,
        english: dto.english || false,
        // Garis Kewenangan (a.n.) — label pemberi kuasa untuk template signature.
        atasNama: dto.atas_nama || null,
        atasNamaPositionId: dto.atas_nama_position_id
          ? String(dto.atas_nama_position_id)
          : null,
      });
      await queryRunner.manager.save(naskah);

      // Determine if this is a draft (pending = TTD basah, belum terkirim ke penerima)
      const isDraft = status === 'draf' || status === 'pending';

      // PHASE 5a: Insert ke naskah_referensi (HANYA jika ada id_referensi_naskah)
      // Fitur sirkulasi persuratan - surat baru bisa memiliki referensi ke surat sebelumnya
      if (dto.id_referensi_naskah) {
        const naskahRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_referensi_naskah },
        });

        if (naskahRef) {
          const referensi = queryRunner.manager.create(NaskahReferensiEntity, {
            id: uuidv4(),
            id_naskah: naskahId,
            tanggal: naskah.tanggal,
            ref_jenis: naskahRef.jenis || 'SDE',
            ref_pengirim: null,
            ref_tanggal: naskahRef.tanggal || null,
            ref_nomor: naskahRef.nomor || null,
            ref_perihal: naskahRef.perihal || null,
          });
          await queryRunner.manager.save(referensi);

          // Mark tindak_lanjut=1 on the user's (pengirim) penerima sirkulasi of
          // the original naskah → disables lanjut buttons in kotak-masuk
          await this.naskahSirkulasiService.markTindakLanjut(
            dto.id_referensi_naskah,
            String(dto.pengirim),
            queryRunner.manager,
          );
        }
      }

      // PHASE 6: Insert sirkulasi - pengirim dan tembusan
      const pengirimSirkulasi = await this.createSirkulasiFromOrgData(
        naskahId,
        'pengirim',
        pengirim,
        isDraft,
        0,
      );
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 6.1: Insert sirkulasi - tembusan (if any) with urutan
      const pendingNotifications: Array<() => Promise<any>> = [];
      if (tembusanList && tembusanList.length > 0) {
        for (let i = 0; i < tembusanList.length; i++) {
          const tembusan = tembusanList[i];
          const tembusanSirkulasi = await this.createSirkulasiFromOrgData(
            naskahId,
            'tembusan',
            tembusan,
            isDraft,
            i,
          );
          await queryRunner.manager.save(tembusanSirkulasi);

          // Queue notification to tembusan (sent AFTER commit)
          if (!isDraft) {
            const posId = String(tembusan.position);
            const persnum = tembusan.persnum_person
              ? Number(tembusan.persnum_person)
              : undefined;
            const sirkId = tembusanSirkulasi.id;
            pendingNotifications.push(() =>
              this.notificationService
                .createNaskahMasukNotification({
                  positionId: posId,
                  userPersnum: persnum,
                  naskahId,
                  sirkulasiId: sirkId,
                  jenis: 'SDE',
                  nomor: nomorSurat,
                  perihal: dto.perihal,
                  pengirim:
                    pengirim.persnum_person_text || pengirim.position_text,
                  pengirimPosition: pengirim.position_text,
                  isTembusan: true,
                })
                .catch((err) =>
                  console.error(
                    '[SDE] ❌ Tembusan notification failed:',
                    err.message,
                  ),
                ),
            );
          }
        }
      }

      // PHASE 6.2: Insert sirkulasi - penerima eksternal (if any) with urutan
      if (penerimaList && penerimaList.length > 0) {
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = await this.createSirkulasiFromEksternal(
            naskahId,
            penerima,
            isDraft,
            i,
          );
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // PHASE 7: Handle lampiran
      // Handle temporary lampiran (RECOMMENDED - dari POST /upload-temporary)
      // Also get file names for response
      let lampiranFileNames: string[] = [];
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        // Get file names before moving
        const lampiranFiles = await this.getTemporaryLampiranFiles(
          dto.lampiran_temp_ids,
        );
        lampiranFileNames = lampiranFiles.map((f) => f.fileName);

        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'surat-dinas-eksternal/lampiran',
        );
      }

      // Handle legacy lampiran_files (DEPRECATED, tapi masih support backward compatibility)
      if (dto.lampiran_files && dto.lampiran_files.length > 0) {
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            tanggal: naskah.tanggal,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 8: Build kepada_yth dari penerima eksternal
      const kepadaYthList = penerimaList.map((p) => p.nama);
      const kepadaYth = kepadaYthList.join('; ');

      // Build alamat dari penerima pertama (atau gabungan)
      const alamatPenerima =
        penerimaList.length === 1
          ? penerimaList[0].alamat || ''
          : penerimaList.map((p) => `${p.nama}: ${p.alamat || '-'}`).join('\n');

      // PHASE 8.1: Convert tembusan positionIds to names
      let tembusanNames: string[] = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        tembusanNames = await this.convertPositionIdsToNames(
          dto.tembusan,
          tanggal,
        );
      }

      // PHASE 9: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Data sudah tersimpan di naskah dan naskah_sirkulasi
      // tanda_tangan sudah tersimpan di naskah.tandaTangan

      // PHASE 10: Auto-generate PDF with nomor and lampiran (only for final/final_tte)
      let finalPdfPath: string | undefined = undefined;

      if (status !== 'draf') {
        try {
          // Get dynamic header info dari sub_area_alamat berdasarkan pengirim context
          const headerInfo = await this.getHeaderInfoByUser(
            {
              company: COMPANY_ID, // Use default company ID
              area: pengirim.area ?? undefined,
              subArea:
                pengirim.sub_area != null
                  ? String(pengirim.sub_area)
                  : undefined,
            },
            tanggal,
          );

          // Use kota from headerInfo if available
          const dynamicNamaTempat =
            headerInfo?.kota ||
            dto.nama_tempat ||
            pengirim.sub_area_text ||
            'Tangerang';

          // Determine lampiran text from temp files
          let lampiranTextForPdf = dto.lampiran || '-';
          if (lampiranFileNames.length > 0) {
            lampiranTextForPdf = lampiranFileNames.join(', ');
          }

          // Generate PDF with nomor already included (using same approach as preview-pdf)
          let pdfBuffer = await this.generatePdfSudinService.generatePdf({
            html: Buffer.from(dto.konten || '', 'utf-8').toString('base64'),
            penerima: kepadaYthList,
            nama_tempat: dynamicNamaTempat,
            tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            positionText: dto.nama_jabatan || pengirim.position_text,
            namaLengkap:
              dto.nama_lengkap || pengirim.persnum_person_text || pengirim.nama,
            // Garis Kewenangan (a.n.) — label pemberi kuasa untuk signature block.
            atasNama: dto.atas_nama || null,
            tembusan: tembusanNames, // Include tembusan in PDF (same as preview-pdf)
            perihal: dto.perihal,
            sifat: dto.sifat || 'Biasa',
            nomor: nomorSurat,
            lampiran: lampiranTextForPdf,
            // Dynamic header info dari sub_area_alamat
            headerKantor: headerInfo?.kantor,
            headerGedung: headerInfo?.gedung,
            headerAlamat: headerInfo?.alamat,
            // English format flag
            english: dto.english === true,
          });

          // Merge with lampiran if any
          if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
            const lampiranFilesForMerge = await this.getTemporaryLampiranFiles(
              dto.lampiran_temp_ids,
            );
            if (lampiranFilesForMerge && lampiranFilesForMerge.length > 0) {
              pdfBuffer = await this.mergePdfWithTemporaryFiles(
                pdfBuffer,
                lampiranFilesForMerge,
              );
            }
          }

          // Upload PDF to storage with organized folder structure
          const timestamp = Date.now();
          const pdfFileName = `SDE-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;

          const uploadResult = await this.storageService.uploadBuffer(
            pdfBuffer,
            pdfFileName,
            'application/pdf',
            'surat-dinas-eksternal/final',
          );

          finalPdfPath = uploadResult.key;

          // Update naskah with final_pdf path
          await queryRunner.manager.update(
            NaskahEntity,
            { id: naskahId },
            { final_pdf: finalPdfPath },
          );

          // Update nomor_request_detail dengan file PDF yang sudah di-generate
          await queryRunner.manager
            .createQueryBuilder()
            .update('nomor_request_detail')
            .set({
              fileName: pdfFileName,
              fileText: finalPdfPath,
            })
            .where('nomor = :nomor', { nomor: nomorSurat })
            .andWhere('status = :status', { status: 'terpakai_final' })
            .execute();
        } catch (error) {
          // Don't fail the whole transaction if PDF generation fails
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Send queued notifications AFTER commit (so DB is visible to WebSocket queries)
      for (const send of pendingNotifications) {
        send().catch(() => {});
      }

      // Sync to Meilisearch (non-blocking, after successful commit)
      this.meilisearchSyncService.syncNaskah(naskahId).catch(() => {});

      // Build penerima response
      const penerimaResponses: SdePenerimaInfoDto[] = penerimaList.map((ext) =>
        this.toEksternalPenerimaInfo(ext),
      );

      // Build tembusan response from org_data
      const tembusanResponses: SdeSirkulasiInfoDto[] = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const posId of dto.tembusan) {
          const tembusanPos = barisData.find(
            (x) => Number(x.position) === Number(posId),
          );
          if (tembusanPos) {
            tembusanResponses.push(this.toSirkulasiInfo(tembusanPos));
          }
        }
      }

      // Build lampiran text from file names
      const lampiranText =
        lampiranFileNames.length > 0
          ? lampiranFileNames.join(', ')
          : dto.lampiran || undefined;

      // Return response - use toSirkulasiInfo directly from org_data (same as SDI)
      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDE',
          nomor: nomorSurat,
          tanggal: this.formatDateToString(tanggalHariIni),
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim), // Use helper directly from org_data
          penerima: penerimaResponses,
          tembusan: tembusanResponses, // Always return array (empty or filled)
          lampiran: lampiranText, // Nama file lampiran dari temporary files
          final_pdf: finalPdfPath || null, // Always include final_pdf field (null if not generated)
          // Additional fields untuk digsig (match SDI response) - legacy createSde doesn't have signing
          sign_option: dto.sign_option,
          bsre_name_doc: null,
        } as any,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Create SDE with Signing Support
   * Menggabungkan create naskah + generate PDF + signing (QR/BSrE) dalam satu transaction
   *
   * Flow Signing:
   * 1. NONE: Generate PDF biasa tanpa QR, tanda_tangan = null
   * 2. QR_ONLY: Generate QR sederhana, embed di template, tanda_tangan = null
   * 3. DIGSIG:
   *    - Generate QR dengan signature_id dan verification_url
   *    - Embed QR ke PDF template
   *    - Hit BSrE API untuk digital signature
   *    - Simpan metadata di tanda_tangan
   *
   * @param dto - DTO dengan sign_option dan passphrase
   * @param status - Status naskah (final/final_tte)
   * @param persnum - Persnum user untuk BSrE (optional, required for digsig)
   */
  private async createSdeWithSigning(
    dto: CreateSuratDinasEksternalDto,
    status: 'pending' | 'pending_tte' | 'final' | 'final_tte',
    persnum?: number,
    reservedNomor?: string,
    bsreUserData?: { nik: string; no_wa: string },
    digsigBatch?: DigsigBatchContext,
    portalUser?: JwtPayload,
    deferPortalRequest = false,
  ): Promise<SdeSendMessageResponseDto> {
    const isPortalMode = status === 'pending_tte';
    // Use provided date or today
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 1: Get org_data
    const orgData = await this.orgDataService.findOrg(tanggal);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // PHASE 2: Validate pengirim from org_data
    const pengirim = barisData.find(
      (x) => Number(x.position) === Number(dto.pengirim),
    );
    if (!pengirim) {
      throw new NotFoundException(
        `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
      );
    }
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(
        `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`,
      );
    }

    console.log(`[SDE] Pengirim data:`, {
      position: pengirim.position,
      position_text: pengirim.position_text,
      persnum_person_text: pengirim.persnum_person_text,
    });
    console.log(`[SDE] DTO nama_jabatan:`, dto.nama_jabatan);
    console.log(`[SDE] DTO nama_lengkap:`, dto.nama_lengkap);

    // PHASE 3: Validate penerima dari tabel eksternal (sama seperti createSde)
    const penerimaList: EksternalEntity[] = [];

    if (dto.penerima && dto.penerima.length > 0) {
      for (const penerimaValue of dto.penerima) {
        // Trim whitespace from value
        const cleanValue = String(penerimaValue).trim();

        // Check if it's a UUID (contains dashes and is 36 chars) or a number (position ID)
        const isUuid = cleanValue.includes('-') && cleanValue.length === 36;

        let eksternal: EksternalEntity | null = null;

        if (isUuid) {
          // Search by eksternal.id (UUID)
          eksternal = await this.eksternalRepository.findOne({
            where: { id: cleanValue, aktif: true },
          });
        } else {
          // Search by id_position_pembuat (position ID)
          eksternal = await this.eksternalRepository.findOne({
            where: { id_position_pembuat: cleanValue, aktif: true },
          });
        }

        if (!eksternal) {
          continue; // Skip instead of throwing error to be more lenient
        }

        // Avoid duplicates
        if (!penerimaList.find((p) => p.id === eksternal.id)) {
          penerimaList.push(eksternal);
        }
      }
    }

    // PHASE 4: Validate tembusan (internal)
    // Catatan: validasi chief (managerial) dilepas — semua position internal
    // (termasuk staff) boleh dijadikan tembusan dan menerima surat di kotak masuk.
    const tembusanList: SdeOrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find(
          (x) => Number(x.position) === Number(posId),
        );
        if (!tembusan) {
          throw new NotFoundException(
            `Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`,
          );
        }
        tembusanList.push(tembusan);
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 5: Generate nomor surat
      const tanggalNomor = dto.tgl ? this.parseDateString(dto.tgl) : new Date();
      const nomorSurat =
        reservedNomor ||
        (await this.generateNomorWithIntegration(
          pengirim,
          dto.klasifikasi,
          dto.perihal,
          tanggalNomor,
          queryRunner,
        ));

      // PHASE 6: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = dto.tgl
        ? this.parseDateString(dto.tgl)
        : new Date();
      const renderedKonten = (dto.konten || '')
        .replace(/\{\{\s*nomor_surat\s*\}\}/gi, nomorSurat)
        .replace(
          /\{\{\s*tanggal_surat\s*\}\}/gi,
          tanggalHariIni.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        )
        .replace(/\{\{\s*sifat_surat\s*\}\}/gi, dto.sifat || 'biasa');

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'SDE',
        klasifikasi: dto.klasifikasi,
        klasifikasi_text: dto.klasifikasi_text || undefined,
        sifat: dto.sifat || 'biasa',
        nomor: nomorSurat,
        tanggal: tanggalHariIni,
        lampiran: dto.lampiran || undefined,
        perihal: dto.perihal,
        konten: renderedKonten,
        tempat: dto.nama_tempat || undefined,
        status: status,
        signOption: dto.sign_option || null,
        final_pdf: undefined, // Will be updated after PDF generation
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // PHASE 6a: Insert ke naskah_referensi (HANYA jika ada id_referensi_naskah)
      // Fitur sirkulasi persuratan - surat baru bisa memiliki referensi ke surat sebelumnya
      if (dto.id_referensi_naskah) {
        const naskahRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_referensi_naskah },
        });

        if (naskahRef) {
          const referensi = queryRunner.manager.create(NaskahReferensiEntity, {
            id: uuidv4(),
            id_naskah: naskahId,
            tanggal: naskah.tanggal,
            ref_jenis: naskahRef.jenis || 'SDE',
            ref_pengirim: null,
            ref_tanggal: naskahRef.tanggal || null,
            ref_nomor: naskahRef.nomor || null,
            ref_perihal: naskahRef.perihal || null,
          });
          await queryRunner.manager.save(referensi);

          // SDE Massal memakai nomor reservasi dan menandai tindak lanjut satu
          // kali setelah seluruh batch selesai. Meng-update baris induk yang
          // sama dari setiap transaksi paralel akan membuat lock baru.
          if (!reservedNomor) {
            await this.naskahSirkulasiService.markTindakLanjut(
              dto.id_referensi_naskah,
              String(dto.pengirim),
              queryRunner.manager,
            );
          }
        }
      }

      // PHASE 7: Insert sirkulasi
      // TTD Basah (pending) → isDraft=true, no notifications (belum terkirim ke penerima)
      const isPending = status === 'pending' || status === 'pending_tte';
      const pengirimSirkulasi = await this.createSirkulasiFromOrgData(
        naskahId,
        'pengirim',
        pengirim,
        isPending,
        0,
      );
      await queryRunner.manager.save(pengirimSirkulasi);

      // Insert penerima eksternal ke sirkulasi (using createSirkulasiFromEksternal)
      const penerimaResponses: any[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = await this.createSirkulasiFromEksternal(
          naskahId,
          penerima,
          isPending,
          i,
        );
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push({
          nama: penerima.nama,
          alamat: penerima.alamat,
        });
      }

      const tembusanResponses: SdeSirkulasiInfoDto[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = await this.createSirkulasiFromOrgData(
          naskahId,
          'tembusan',
          tembusan,
          isPending,
          i,
        );
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));

        // Send notification to tembusan (skip for pending/TTD basah; penerima is external, no notification)
        if (!isPending) {
          console.log(
            `[SDE:Signing] 🔔 TRIGGERING NOTIFICATION for tembusan: position=${tembusan.position}, persnum=${tembusan.persnum_person}`,
          );
          this.notificationService
            .createNaskahMasukNotification({
              positionId: String(tembusan.position),
              userPersnum: tembusan.persnum_person
                ? Number(tembusan.persnum_person)
                : undefined,
              naskahId,
              sirkulasiId: tembusanSirkulasi.id,
              jenis: 'SDE',
              nomor: nomorSurat,
              perihal: dto.perihal,
              pengirim: pengirim.persnum_person_text || pengirim.position_text,
              pengirimPosition: pengirim.position_text,
              isTembusan: true,
            })
            .then((notif) => {
              console.log(
                `[SDE:Signing] ✅ Notification created for tembusan ${tembusan.position}:`,
                notif ? notif.id : 'null',
              );
            })
            .catch((err) => {
              console.error(
                `[SDE:Signing] ❌ Failed to create notification for tembusan ${tembusan.position}:`,
                err.message,
              );
            });
        }
      }

      // PHASE 8: Handle lampiran - Move dari temporary ke final folder
      let lampiranFileNames: string[] = [];
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        console.log(
          `[SDE] PHASE 8 - lampiran_temp_ids:`,
          dto.lampiran_temp_ids,
        );
        console.log(
          `[SDE] PHASE 8 - lampiran_temp_ids type:`,
          typeof dto.lampiran_temp_ids,
        );
        console.log(
          `[SDE] PHASE 8 - lampiran_temp_ids[0]:`,
          dto.lampiran_temp_ids[0],
        );

        // Get file names before moving
        const lampiranFiles = await this.getTemporaryLampiranFiles(
          dto.lampiran_temp_ids,
        );
        console.log(
          `[SDE] PHASE 8 - Found ${lampiranFiles.length} lampiran files`,
        );
        lampiranFileNames = lampiranFiles.map((f) => f.fileName);

        // Move lampiran dari temporary ke final folder
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'surat-dinas-eksternal/lampiran',
        );
      }

      // Referensi PDF content-addressed dari SDE Masal.
      if (dto.lampiran_direct_refs && dto.lampiran_direct_refs.length > 0) {
        for (const ref of dto.lampiran_direct_refs) {
          const fileName = ref.fileName.trim();
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            tanggal: naskah.tanggal,
            file_name: fileName,
            file_pdf: ref.key,
            jenis: 'SDE',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
          lampiranFileNames.push(fileName);
        }
      }

      // PHASE 9: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Data sudah tersimpan di naskah dan naskah_sirkulasi
      const kepadaYthList = penerimaList.map((p) => p.nama);
      const kepadaYth = kepadaYthList.join('; ');
      const tembusanTextList = tembusanList.map((t) => t.position_text);
      const tembusanText =
        tembusanTextList.length > 0 ? tembusanTextList.join('\n') : null;

      // Get dynamic header info
      const headerInfo = await this.getHeaderInfoByUser(
        {
          company: pengirim.company ?? undefined,
          area: pengirim.area ?? undefined,
          subArea:
            pengirim.sub_area != null ? String(pengirim.sub_area) : undefined,
        },
        tanggal,
      );

      const dynamicNamaTempat =
        headerInfo?.kota ||
        dto.nama_tempat ||
        pengirim.sub_area_text ||
        'Tangerang';

      // PHASE 10: Generate PDF dengan QR code (jika signing)
      let finalPdfPath: string | undefined = undefined;
      let pdfBuffer: Buffer;
      let signatureMetadata: string | null = null;
      let bsreNameDoc: string | null = null;

      // Prepare signing data BEFORE generating PDF (untuk embed QR di template)
      const signerName =
        dto.nama_lengkap || pengirim.persnum_person_text || 'Penandatangan';
      const signerJabatan =
        dto.nama_jabatan || pengirim.position_text || 'Jabatan';
      let qrCodeHtml: string | undefined = undefined;
      let signatureId: string | undefined = undefined;
      let signedAt: string | undefined = undefined;
      let verificationUrl: string | undefined = undefined;

      console.log(
        `[SDE] Phase 10 - Preparing signing, sign_option: ${dto.sign_option}, persnum: ${persnum}`,
      );

      // Pre-generate QR code untuk digsig atau qr_only SEBELUM generate PDF
      if (
        (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) ||
        dto.sign_option === SignOption.QR_ONLY
      ) {
        signedAt = new Date().toISOString();
        signatureId = generateSignatureId();
        verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

        const qrData: QRCodeData = {
          signature_id:
            dto.sign_option === SignOption.DIGSIG ? signatureId : '',
          document_number: nomorSurat,
          signed_at: signedAt,
          signer_name: signerName,
          signer_jabatan: signerJabatan,
          document_type: 'Surat Dinas Eksternal',
          verification_url:
            dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
        };

        // Generate QR Code sebagai base64 HTML untuk template
        console.log(`[SDE] Generating QR Code HTML for template`);
        const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
        qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
        console.log(`[SDE] QR Code HTML generated successfully`);
      }

      try {
        // Generate PDF dengan QR code di template (jika ada)
        console.log(
          `[SDE] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`,
        );

        // Use fallback for empty string, not just undefined/null
        const finalPositionText =
          dto.nama_jabatan && dto.nama_jabatan.trim()
            ? dto.nama_jabatan
            : pengirim.position_text;
        const finalNamaLengkap =
          dto.nama_lengkap && dto.nama_lengkap.trim()
            ? dto.nama_lengkap
            : pengirim.persnum_person_text || '';

        console.log(`[SDE] positionText for PDF: ${finalPositionText}`);
        console.log(`[SDE] namaLengkap for PDF: ${finalNamaLengkap}`);

        pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: renderedKonten,
          htmlContent: renderedKonten,
          nomor: nomorSurat,
          penerima: kepadaYthList,
          tembusan: tembusanTextList,
          perihal: dto.perihal,
          lampiran:
            lampiranFileNames.length > 0
              ? lampiranFileNames.join(', ')
              : dto.lampiran || undefined,
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: finalPositionText,
          namaLengkap: finalNamaLengkap,
          // Garis Kewenangan (a.n.) — label pemberi kuasa untuk signature block.
          atasNama: dto.atas_nama || null,
          nama_tempat: dynamicNamaTempat,
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML - akan ditampilkan di template di antara jabatan dan nama
          qrCodeHtml: qrCodeHtml,
          // English format flag
          english: dto.english === true,
        });
        console.log(`[SDE] PDF generated successfully`);

        // Merge with lampiran if any
        if (
          (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) ||
          (dto.lampiran_direct_refs && dto.lampiran_direct_refs.length > 0)
        ) {
          const lampiranFiles = [
            ...(dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0
              ? await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids)
              : []),
            ...(dto.lampiran_direct_refs || []).map((ref) => ({
              fileName: ref.fileName,
              filePath: ref.key,
            })),
          ];
          if (lampiranFiles && lampiranFiles.length > 0) {
            console.log(
              `[SDE] Merging ${lampiranFiles.length} lampiran file(s) to PDF`,
            );
            pdfBuffer = await this.mergePdfWithTemporaryFiles(
              pdfBuffer,
              lampiranFiles,
            );
            console.log(`[SDE] Lampiran merged successfully`);
          }
        }

        // PHASE 11: Call BSrE API jika DIGSIG
        if (
          dto.sign_option === SignOption.DIGSIG &&
          persnum &&
          dto.passphrase &&
          !isPortalMode
        ) {
          console.log(
            `[SDE] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`,
          );

          // 11a. Fetch NIK dan no_wa dari HR API via DigsigService
          console.log(
            `[SDE] Step 11a - Fetching user data for persnum: ${persnum}`,
          );
          const userData =
            bsreUserData ||
            (await this.digsigService.getUserDataForBsre(persnum.toString()));
          console.log(`[SDE] Step 11a - Got userData:`, {
            nik: userData.nik,
            no_wa: userData.no_wa,
          });

          // 11b. Upload PDF (dengan QR) ke temp untuk BSrE signing
          console.log(`[SDE] Step 11b - Uploading temp PDF for BSrE`);
          const tempTimestamp = Date.now();
          const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
          const tempUpload = await this.storageService.uploadBuffer(
            pdfBuffer,
            tempFileName,
            'application/pdf',
            'surat-dinas-eksternal/temp',
          );
          console.log(`[SDE] Step 11b - Temp PDF uploaded: ${tempUpload.key}`);

          // 11c. Hit BSrE API untuk digital signature
          console.log(`[SDE] Step 11c - Hitting BSrE API`);
          const bsreResponse = await this.digsigService.hitDigsigEndpoint(
            {
              key: tempUpload.key,
              filename: tempFileName,
              nomorDokumen: nomorSurat,
              tanggalDokumen: this.formatDateToString(tanggalHariIni),
              klasifikasi: dto.klasifikasi || 'Biasa',
              jenisNaskah: 'Surat Dinas Eksternal',
              perihal: dto.perihal,
              nik: userData.nik,
              passphrase: dto.passphrase,
              path_dokumen: 'surat-dinas-eksternal/digsig/',
              no_wa: userData.no_wa,
            },
            {
              userPersnum: persnum,
              userName: signerName || 'User',
              idNaskah: naskahId,
              jenisNaskah: 'SDE',
              batch: digsigBatch,
            },
          );
          console.log(
            `[SDE] Step 11c - BSrE response:`,
            JSON.stringify(bsreResponse, null, 2),
          );

          // 11d. Extract name_doc from BSrE response (krusial untuk verifikasi)
          bsreNameDoc =
            bsreResponse?.name_doc?.[0] ||
            bsreResponse?.data?.name_doc?.[0] ||
            null;
          console.log(`[SDE] Step 11d - BSrE name_doc: ${bsreNameDoc}`);

          // 11e. Build signature metadata
          signatureMetadata = formatSignatureData({
            type: 'digsig',
            doc_id: bsreResponse?.doc_id || bsreResponse?.data?.doc_id,
            signature_id: signatureId!,
            signed_at: signedAt!,
            signer_nik: userData.nik,
            signer_name: signerName,
            signer_jabatan: signerJabatan,
            path: null, // Will be updated after upload
            verification_url: verificationUrl!,
            bsre_name_doc: bsreNameDoc, // Simpan name_doc untuk verifikasi
          });
          console.log(`[SDE] Step 11e - Signature metadata built`);

          // 11f. Cleanup temp file
          try {
            await this.storageService.deleteFile(tempUpload.key);
          } catch (e) {
            console.warn(`[SDE] Failed to cleanup temp file: ${e.message}`);
          }

          // 11g. Download signed PDF from digsig/ and upload to final/
          if (bsreNameDoc) {
            console.log(`[SDE] Step 11g - Downloading signed PDF from digsig/`);
            const digsigPath = `surat-dinas-eksternal/digsig/${bsreNameDoc}`;
            try {
              const signedPdfBuffer =
                await this.storageService.getFile(digsigPath);
              console.log(
                `[SDE] Step 11g - Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`,
              );
              // Replace pdfBuffer with signed version
              pdfBuffer = signedPdfBuffer;
            } catch (e) {
              console.warn(
                `[SDE] Step 11g - Failed to download signed PDF from digsig/, will use original: ${e.message}`,
              );
            }
          }

          // Update tanda_tangan di naskah (SdiSdeEntity tidak lagi digunakan)
          await queryRunner.manager.update(
            NaskahEntity,
            { id: naskahId },
            { tandaTangan: signatureMetadata },
          );
        }

        // PHASE 12: Upload final PDF using storageService (same as ND)
        const finalTimestamp = Date.now();
        const pdfFileName = `SDE-${nomorSurat.replace(/\//g, '-')}-${finalTimestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'surat-dinas-eksternal/final',
        );

        finalPdfPath = uploadResult.key;
        console.log(`[SDE] Final PDF uploaded at: ${finalPdfPath}`);

        // Update naskah final_pdf
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update nomor_request_detail dengan file PDF yang sudah di-generate
        await queryRunner.manager
          .createQueryBuilder()
          .update('nomor_request_detail')
          .set({
            fileName: pdfFileName,
            fileText: finalPdfPath,
          })
          .where('nomor = :nomor', { nomor: nomorSurat })
          .andWhere('status = :status', { status: 'terpakai_final' })
          .execute();

        // COMMIT TRANSACTION
        await queryRunner.commitTransaction();
        console.log(`[SDE] Transaction committed successfully`);

        let portalRedirect:
          | { transactionId: string; signingUrl: string }
          | undefined;
        if (isPortalMode && !deferPortalRequest) {
          if (!portalUser || !finalPdfPath) {
            throw new BadRequestException(
              'Konteks pengguna atau PDF SDE untuk Portal TTE tidak lengkap',
            );
          }
          const portal = await this.tteSigningService.createSigningTransaction({
            sourceKey: finalPdfPath,
            filename: finalPdfPath.split('/').pop() || `SDE-${naskahId}.pdf`,
            pathDokumen: 'surat-dinas-eksternal/digsig/',
            idNaskah: naskahId,
            jenisNaskah: 'SDE',
            nomorNaskah: nomorSurat,
            location: dto.nama_tempat || 'Indonesia',
            reason: `Penandatanganan Surat Dinas Eksternal ${nomorSurat}`,
            user: portalUser,
          });
          portalRedirect = {
            transactionId: portal.transactionId,
            signingUrl: portal.signingUrl,
          };
        }

        // Sync to Meilisearch (non-blocking, after successful commit)
        this.meilisearchSyncService.syncNaskah(naskahId).catch(() => {});

        // Format lampiran text
        const lampiranText =
          lampiranFileNames.length > 0 ? lampiranFileNames.join(', ') : '';

        // Return response
        return {
          success: true,
          data: {
            id: naskahId,
            jenis: 'SDE',
            nomor: nomorSurat,
            tanggal: this.formatDateToString(tanggalHariIni),
            status: status,
            perihal: dto.perihal,
            pengirim: this.toSirkulasiInfo(pengirim),
            penerima: penerimaResponses,
            tembusan: tembusanResponses,
            lampiran: lampiranText,
            final_pdf: finalPdfPath || null,
            sign_option: dto.sign_option,
            bsre_name_doc: bsreNameDoc,
            tte_redirect: portalRedirect,
          } as any,
        };
      } catch (pdfError) {
        console.error(`[SDE] PDF generation or signing failed:`, pdfError);
        throw pdfError;
      }
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      console.error(`[SDE] Transaction rolled back due to error:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Parse form-data body + uploaded files to CreateSuratDinasEksternalDto
   *
   * Form-data fields:
   * - pengirim: positionId (number)
   * - penerima: array of eksternal.id (JSON string or comma-separated)
   * - kop_logo, kop_nama, alamat_perusahaan (optional)
   * - klasifikasi, sifat, perihal, konten (required)
   * - nama_tempat, nama_jabatan, tanda_tangan, nama_lengkap (optional)
   * - lampiran: string description
   * - lampiran_temp_ids: array of UUID strings from temporary upload
   * - tgl: optional date in YYYY-MM-DD format
   *
   * @param body - Raw form-data body
   * @param files - Uploaded files (not used for initial creation, use upload-temporary endpoint)
   * @returns CreateSuratDinasEksternalDto
   */
  async parseFormDataToCreateDto(
    body: any,
    files?: Express.Multer.File[],
  ): Promise<CreateSuratDinasEksternalDto> {
    // Helper: Parse UUID array field (bisa JSON string, comma-separated, atau curly-braces format)
    const parseUuidArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        // Remove curly braces if present (from form-data array format)
        let cleanValue = value.trim();
        if (cleanValue.startsWith('{') && cleanValue.endsWith('}')) {
          cleanValue = '[' + cleanValue.slice(1, -1) + ']';
        }

        try {
          // Try parse as JSON
          const parsed = JSON.parse(cleanValue);
          return Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          // Parse as comma-separated (also handle curly braces content)
          const content = cleanValue
            .replace(/^\{|\}$/g, '')
            .replace(/^\[|\]$/g, '');
          return content
            .split(',')
            .map((v: string) => v.trim().replace(/^"|"$/g, ''));
        }
      }
      return [String(value)];
    };

    // Parse penerima - array of eksternal.id UUIDs (optional)
    // Support both 'penerima' and 'tertuju' field names for backward compatibility
    const penerimaArray = parseUuidArray(body.penerima || body.tertuju);

    // Parse tembusan - array of positionId numbers (optional)
    const parseTembusanArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((v: any) => Number(v));
      if (typeof value === 'string') {
        try {
          // Try parse as JSON
          const parsed = JSON.parse(value);
          return Array.isArray(parsed)
            ? parsed.map((v: any) => Number(v))
            : [Number(parsed)];
        } catch {
          // Parse as comma-separated
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    const tembusanArray = parseTembusanArray(body.tembusan);

    // Build DTO
    const dto: CreateSuratDinasEksternalDto = {
      // Sirkulasi
      pengirim: Number(body.pengirim),
      penerima: penerimaArray,
      tembusan: tembusanArray.length > 0 ? tembusanArray : undefined,
      tgl: body.tgl,

      // Referensi Naskah (untuk sirkulasi persuratan)
      id_referensi_naskah: body.id_referensi_naskah,

      // Kop
      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,

      // Data Naskah
      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat || 'biasa',
      perihal: body.perihal,
      konten: body.konten,
      english: body.english === 'true' || body.english === true,

      // Kaki
      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      tanda_tangan: body.tanda_tangan,
      nama_lengkap: body.nama_lengkap,

      // Garis Kewenangan (a.n.)
      atas_nama: body.atas_nama || undefined,
      atas_nama_position_id: body.atas_nama_position_id
        ? Number(body.atas_nama_position_id)
        : undefined,

      // Lampiran
      lampiran: body.lampiran,
      lampiran_temp_ids: body.lampiran_temp_ids
        ? parseUuidArray(body.lampiran_temp_ids)
        : undefined,

      // Signing options
      sign_option: body.sign_option,
      passphrase: body.passphrase,
    };

    return dto;
  }

  /**
   * Upload temporary lampiran files
   * Creates naskah_lampiran records with is_temporary=1
   *
   * @param files - Array of uploaded files
   * @param id_naskah - Naskah ID (can be null for temp-only storage)
   * @param jenis - Document type (ND, SDI, SDE, DI, KA)
   * @returns Array of lampiran IDs
   */
  async uploadTemporaryLampiran(
    files: Express.Multer.File[],
    id_naskah?: string | null,
    jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
  ): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Tidak ada file yang diupload');
    }

    const tempFolderId = uuidv4();
    const lampiranIds: string[] = [];

    // Kunci partisi: bila id_naskah diberikan, tanggal lampiran temp mengikuti
    // tanggal naskah induk supaya tetap selaras dengan partisi tahun naskah
    // (bukan tanggal upload). Tanpa id_naskah → tanggal upload (temp murni).
    const parentNaskah = id_naskah
      ? await this.naskahRepository.findOne({ where: { id: id_naskah } })
      : null;

    for (const file of files) {
      // Upload file first to get the path
      const uploadResult = await this.storageService.uploadFile(
        file,
        `surat-dinas-eksternal/lampiran/temporary/${tempFolderId}`,
      );

      // Create lampiran record with file_pdf populated
      // id_naskah is null for temporary uploads (akan diupdate saat moveToFinal)
      const lampiranEntity = this.naskahLampiranRepository.create({
        id: uuidv4(),
        id_naskah: id_naskah || null, // Null untuk temporary upload, akan diupdate nanti
        tanggal: parentNaskah?.tanggal ?? new Date(),

        file_name: file.originalname,
        file_pdf: uploadResult.key, // Set file path from upload
        jenis: jenis || 'SDE', // Default SDE
        is_temporary: 1,
        temp_folder_id: tempFolderId,
      } as Partial<NaskahLampiranEntity>);

      await this.naskahLampiranRepository.save(lampiranEntity);
      lampiranIds.push(lampiranEntity.id);
    }

    return lampiranIds;
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  /**
   * Send Message - Kirim SDE ke pihak eksternal
   * Status: 'final' (tanpa tanda tangan) atau 'final_tte' (dengan tanda tangan)
   */
  async sendMessage(
    dto: CreateSuratDinasEksternalDto,
    persnum?: number,
    reservedNomor?: string,
    bsreUserData?: { nik: string; no_wa: string },
    digsigBatch?: DigsigBatchContext,
    portalUser?: JwtPayload,
    deferPortalRequest = false,
  ): Promise<SdeSendMessageResponseDto> {
    const isPortalMode =
      dto.sign_option === SignOption.DIGSIG &&
      (await this.tteSigningGateway.isPortalMode('SDE'));
    // Validate sign_option + passphrase combination
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!isPortalMode && !dto.passphrase) {
        throw new BadRequestException(
          'Passphrase wajib diisi untuk opsi TTD Digital (digsig)',
        );
      }
      if (!persnum) {
        throw new BadRequestException(
          'Persnum user wajib diisi untuk opsi TTD Digital (digsig)',
        );
      }
    }

    // Determine status based on sign_option
    let status: 'pending' | 'pending_tte' | 'final' | 'final_tte' = 'final';
    if (dto.sign_option === SignOption.DIGSIG) {
      status = isPortalMode ? 'pending_tte' : 'final_tte';
    } else if (dto.sign_option === SignOption.TTD_BASAH) {
      status = 'pending';
    }

    // Call createSdeWithSigning with signing options
    return this.createSdeWithSigning(
      dto,
      status,
      persnum,
      reservedNomor,
      bsreUserData,
      digsigBatch,
      portalUser,
      deferPortalRequest,
    );
  }

  skipMassalSigningParticipant(batch: DigsigBatchContext): void {
    this.digsigService.skipBatchParticipant(batch);
  }

  startMassalSigningBatch(batchId: string, expectedCount: number): void {
    this.digsigService.startBatch(batchId, expectedCount);
  }

  /**
   * Save Draft - Simpan SDE sebagai draft
   * Status: 'draf'
   */
  async saveDraft(
    dto: CreateSuratDinasEksternalDto,
  ): Promise<SdeSendMessageResponseDto> {
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
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(
        `Naskah sudah berstatus ${naskah.status}, tidak dapat diupdate sebagai draft`,
      );
    }

    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

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

      pengirimPosition = barisData.find(
        (x) => Number(x.position) === Number(dto.pengirim),
      );
      if (!pengirimPosition) {
        throw new NotFoundException(
          `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
        );
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(
          `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`,
        );
      }
    }

    // PHASE 3: Validate penerima if provided
    const penerimaList = await this.validatePenerimaEksternal(
      dto.penerima || [],
      false, // Don't throw, skip invalid IDs
    );

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 4: Update naskah table (only fields that are provided)
      const naskahUpdateData: Partial<NaskahEntity> = {};
      if (dto.klasifikasi !== undefined)
        naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined)
        naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined)
        naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;
      if (dto.tanda_tangan !== undefined)
        naskahUpdateData.tandaTangan = dto.tanda_tangan;
      if (dto.tgl !== undefined)
        naskahUpdateData.tanggal = this.parseDateString(dto.tgl);

      if (Object.keys(naskahUpdateData).length > 0) {
        await updatePartitionedNaskah(
          queryRunner.manager,
          NaskahEntity,
          { id: naskah.id, tanggal: naskah.tanggal },
          naskahUpdateData,
        );
      }

      // PHASE 5: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Data sudah tersimpan di naskah dan naskah_sirkulasi

      // PHASE 6: Handle sirkulasi update if pengirim changed
      if (dto.pengirim !== undefined && pengirimPosition) {
        // Delete existing pengirim sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'pengirim',
        });

        // Re-insert pengirim with is_draft = true
        const pengirimSirkulasi = await this.createSirkulasiFromOrgData(
          naskahId,
          'pengirim',
          pengirimPosition,
          true,
        );
        await queryRunner.manager.save(pengirimSirkulasi);
      }

      // PHASE 6.1: Handle sirkulasi tembusan - ALWAYS ensure consistency
      // Get existing tembusan positions before deleting
      let tembusanPositionsToInsert: number[] = [];

      if (dto.tembusan !== undefined) {
        // Use provided tembusan from DTO
        tembusanPositionsToInsert = dto.tembusan;
      } else {
        // Get existing tembusan from naskah_sirkulasi before deletion
        const existingTembusanSirkulasi = await queryRunner.manager.find(
          NaskahSirkulasi,
          {
            where: { idNaskah: naskahId, sirkuler: 'tembusan' },
            order: { urutan: 'ASC' },
          },
        );
        if (existingTembusanSirkulasi && existingTembusanSirkulasi.length > 0) {
          tembusanPositionsToInsert = existingTembusanSirkulasi
            .map((t) => parseInt(t.position || '0', 10))
            .filter((p) => p > 0);
        }
      }

      // Delete existing tembusan sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      });

      // Re-insert tembusan if any with urutan
      if (tembusanPositionsToInsert.length > 0) {
        const orgDataForTembusan = await this.orgDataService.findOrg(tanggal);
        if (orgDataForTembusan?.position_json) {
          const barisDataTembusan = orgDataForTembusan.position_json;
          for (let i = 0; i < tembusanPositionsToInsert.length; i++) {
            const posId = tembusanPositionsToInsert[i];
            const tembusanPos = barisDataTembusan.find(
              (x: any) => Number(x.position) === Number(posId),
            );
            if (tembusanPos) {
              const tembusanSirkulasi = await this.createSirkulasiFromOrgData(
                naskahId,
                'tembusan',
                tembusanPos,
                true,
                i,
              );
              await queryRunner.manager.save(tembusanSirkulasi);
            }
          }
        }
      }

      // PHASE 6.2: Handle sirkulasi penerima eksternal - ALWAYS ensure consistency
      // Delete existing penerima sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, {
        idNaskah: naskahId,
        sirkuler: 'penerima',
      });

      // Re-insert penerima eksternal if any with urutan
      if (penerimaList && penerimaList.length > 0) {
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = await this.createSirkulasiFromEksternal(
            naskahId,
            penerima,
            true,
            i,
          );
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // PHASE 7: Update lampiran if changed
      if (dto.lampiran_files !== undefined) {
        // Delete old lampiran
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });

        // Insert new lampiran
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            tanggal: naskah.tanggal,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 7b: Handle lampiran_temp_ids - move temporary lampiran to final
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'surat-dinas-eksternal/lampiran',
        );
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

    // If pengirimPosition is not available (dto.pengirim not provided),
    // lookup from org_data using sirkulasi.position for fallback
    let fallbackPengirimPosition = pengirimPosition;
    if (!fallbackPengirimPosition && pengirimSirkulasi?.position) {
      const orgDataForFallback = await this.orgDataService.findOrg(tanggal);
      if (orgDataForFallback?.position_json) {
        fallbackPengirimPosition = orgDataForFallback.position_json.find(
          (x: SdeOrgDataPositionDto) =>
            Number(x.position) === Number(pengirimSirkulasi.position),
        );
      }
    }

    // Get penerima from naskah_sirkulasi (penerima eksternal stored with sirkuler='penerima', positionStatus='ext')
    const penerimaListFromSirkulasi = await this.naskahSirkulasiRepository.find(
      {
        where: { idNaskah: naskahId, sirkuler: 'penerima' },
        order: { urutan: 'ASC', createdAt: 'ASC' },
      },
    );
    const penerimaResponses: SdePenerimaInfoDto[] = [];
    for (const penerima of penerimaListFromSirkulasi) {
      // idSirkuler contains the external entity ID
      if (penerima.idSirkuler) {
        const ext = await this.eksternalRepository.findOne({
          where: { id: penerima.idSirkuler, aktif: true },
        });
        if (ext) {
          penerimaResponses.push(this.toEksternalPenerimaInfo(ext));
        }
      }
    }

    // Get lampiran file names for response
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranText =
      lampiranList.length > 0
        ? lampiranList.map((l) => l.file_name).join(', ')
        : undefined;

    // Get tembusan directly from naskah_sirkulasi table
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    // Build tembusan info
    const tembusanResponses: SdeSirkulasiInfoDto[] = tembusanList.map((t) => ({
      position: parseInt(t.position || '0', 10),
      position_text: t.positionText || '',
      persnum: parseInt(t.idSirkuler || '0', 10),
      nama: t.namaSirkuler || '',
      organization_id: parseInt(t.organization || '0', 10),
      organization_text: t.organizationText || '',
      sub_area: parseInt(t.subArea || '0', 10),
      sub_area_text: t.subAreaText || '',
      area: t.area || '',
      area_text: t.areaText || '',
    }));

    // Handle tanggal - bisa Date object atau string
    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = this.formatDateToString(updatedNaskah.tanggal);
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
        // Use toSirkulasiInfo directly from org_data (same as SDI)
        pengirim: fallbackPengirimPosition
          ? this.toSirkulasiInfo(fallbackPengirimPosition)
          : {
              position: parseInt(pengirimSirkulasi?.position || '0', 10),
              position_text: pengirimSirkulasi?.positionText || '',
              persnum: pengirimSirkulasi?.idSirkuler
                ? parseInt(pengirimSirkulasi.idSirkuler, 10)
                : null,
              nama: pengirimSirkulasi?.namaSirkuler || null,
              organization_id: parseInt(
                pengirimSirkulasi?.organization || '0',
                10,
              ),
              organization_text: pengirimSirkulasi?.organizationText || '',
              sub_area: pengirimSirkulasi?.subArea
                ? parseInt(pengirimSirkulasi.subArea, 10)
                : null,
              sub_area_text: pengirimSirkulasi?.subAreaText || null,
              area: pengirimSirkulasi?.area || null,
              area_text: pengirimSirkulasi?.areaText || null,
            },
        penerima: penerimaResponses,
        tembusan: tembusanResponses, // Always return array (empty or filled)
        lampiran: lampiranText, // Nama file lampiran dari database
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
   *
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'none'
   * - passphrase: BSrE passphrase (required if sign_option = 'digsig')
   *
   * @param naskahId - UUID of naskah
   * @param dto - FinalizeSdeDraftDto with sign_option and passphrase
   * @param persnum - Persnum user untuk BSrE signing (required if sign_option = 'digsig')
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeSdeDraftDto,
    persnum?: number,
    portalUser?: JwtPayload,
  ): Promise<SdeSendMessageResponseDto> {
    const isPortalMode =
      dto.sign_option === SignOption.DIGSIG &&
      (await this.tteSigningGateway.isPortalMode('SDE'));
    // Validate sign_option + passphrase combination
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!persnum) {
        throw new BadRequestException(
          'Persnum diperlukan untuk Digital Signature (BSrE). Pastikan Anda sudah login.',
        );
      }
      if (!isPortalMode && !dto.passphrase) {
        throw new BadRequestException(
          'Passphrase diperlukan untuk Digital Signature (BSrE).',
        );
      }
    }

    console.log('[SDE finalizeDraft] Input:', {
      naskahId,
      sign_option: dto.sign_option,
      persnum: persnum,
      hasPassphrase: !!dto.passphrase,
    });

    // PHASE 1: Get existing naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'draf') {
      // Naskah konsep yang sudah difinalize via /KONSEP/finalize sudah final & terkirim.
      // send-draft return success idempotent (hanya untuk naskah asli konsep).
      const idKonsep = (naskah as any).id_naskah_konsep as string | null;
      if (
        (naskah.status === 'final' || naskah.status === 'final_tte') &&
        idKonsep
      ) {
        const tgl =
          naskah.tanggal instanceof Date
            ? naskah.tanggal.toISOString().split('T')[0]
            : String(naskah.tanggal || '').split('T')[0];
        return {
          success: true,
          data: {
            id: naskahId,
            jenis: 'SDE',
            nomor: naskah.nomor || '',
            tanggal: tgl,
            status: naskah.status,
            message: 'Naskah sudah final dan terkirim via konsep workflow',
          } as any,
        };
      }
      throw new BadRequestException(
        `Naskah sudah berstatus ${naskah.status}, tidak dapat difinalize`,
      );
    }

    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

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

      pengirimPosition = barisData.find(
        (x) => Number(x.position) === Number(dto.pengirim),
      );
      if (!pengirimPosition) {
        throw new NotFoundException(
          `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
        );
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(
          `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`,
        );
      }
    }

    // PHASE 3: Validate penerima if provided
    const penerimaList = await this.validatePenerimaEksternal(
      dto.penerima || [],
      false, // Don't throw, skip invalid IDs
    );

    // PHASE 4: Get full pengirim data for nomor surat generation
    let finalPengirimPosition = pengirimPosition;
    if (!finalPengirimPosition && existingPengirim) {
      // Get full data from org_data
      if (barisData.length === 0) {
        const orgData = await this.orgDataService.findOrg(tanggal);
        if (orgData?.position_json) {
          barisData = orgData.position_json;
        }
      }
      finalPengirimPosition = barisData.find(
        (x) => Number(x.position) === Number(existingPengirim.position),
      );
      if (!finalPengirimPosition) {
        // Fallback jika tidak ditemukan di org_data
        finalPengirimPosition = {
          position: Number(existingPengirim.position),
          position_text: existingPengirim.positionText || '',
          sub_area: Number(existingPengirim.subArea),
          area_text: existingPengirim.areaText || 'Pusat',
        } as SdeOrgDataPositionDto;
      }
    }

    // PHASE 5: Determine new status based on sign_option
    let newStatus: 'pending' | 'pending_tte' | 'final' | 'final_tte' | 'draf';
    if (dto.sign_option === SignOption.DIGSIG) {
      newStatus = isPortalMode ? 'pending_tte' : 'final_tte';
      console.log(
        `[SDE finalizeDraft] Status = ${newStatus} (DIGSIG ${isPortalMode ? 'Portal' : 'BSrE direct'})`,
      );
    } else if (dto.sign_option === SignOption.QR_ONLY) {
      newStatus = 'final'; // QR code tanpa BSrE
      console.log('[SDE finalizeDraft] Status = final (QR_ONLY)');
    } else if (dto.sign_option === SignOption.TTD_BASAH) {
      newStatus = 'pending'; // TTD Basah - menunggu upload dokumen bertanda tangan
      console.log('[SDE finalizeDraft] Status = pending (TTD_BASAH)');
    } else if (dto.tanda_tangan) {
      newStatus = 'final_tte'; // Legacy: tanda_tangan field provided
      console.log('[SDE finalizeDraft] Status = final_tte (tanda_tangan)');
    } else {
      newStatus = 'final'; // No signature
      console.log('[SDE finalizeDraft] Status = final (no signature)');
    }

    // Variables for signing result (need to be accessible in response)
    let finalPdfPathResult: string | undefined = undefined;
    let bsreNameDocResult: string | null = null;

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let nomorSurat: string;

    try {
      // Generate nomor surat resmi with integrated numbering (inside transaction)
      const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
      const perihal = dto.perihal ?? naskah.perihal ?? '';
      nomorSurat = await this.generateNomorWithIntegration(
        finalPengirimPosition as SdeOrgDataPositionDto,
        klasifikasi,
        perihal,
        new Date(),
        queryRunner,
      );

      // PHASE 6: Update naskah table (all fields + finalization fields)
      const naskahUpdateData: Partial<NaskahEntity> = {
        nomor: nomorSurat,
        status: newStatus,
        signOption: dto.sign_option || null,
      };
      if (dto.klasifikasi !== undefined)
        naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined)
        naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined)
        naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;
      if (dto.tanda_tangan !== undefined)
        naskahUpdateData.tandaTangan = dto.tanda_tangan;

      await queryRunner.manager.update(
        NaskahEntity,
        { id: naskahId },
        naskahUpdateData,
      );

      // PHASE 7: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Field tandaTangan sudah diupdate di naskahUpdateData di atas

      // PHASE 8: Handle sirkulasi update
      if (dto.pengirim !== undefined && pengirimPosition) {
        // Delete existing pengirim sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'pengirim',
        });

        // Re-insert pengirim (isDraft stays true for pending/TTD basah)
        const isPending =
          newStatus === 'pending' || newStatus === 'pending_tte';
        const pengirimSirkulasi = await this.createSirkulasiFromOrgData(
          naskahId,
          'pengirim',
          pengirimPosition,
          isPending,
        );
        await queryRunner.manager.save(pengirimSirkulasi);
      } else {
        // Update isDraft based on status
        // TTD Basah (pending) keeps isDraft=true (belum terkirim ke penerima)
        const isPending =
          newStatus === 'pending' || newStatus === 'pending_tte';
        if (!isPending) {
          await queryRunner.manager.update(
            NaskahSirkulasi,
            { idNaskah: naskahId },
            { isDraft: false },
          );
        }
      }

      // PHASE 8.1: Handle sirkulasi tembusan - ALWAYS ensure consistency
      // Determine tembusan list to insert
      let tembusanPositionsToInsert: number[] = [];

      if (dto.tembusan !== undefined) {
        // Use provided tembusan from DTO
        tembusanPositionsToInsert = dto.tembusan;
      } else {
        // Get existing tembusan positions from naskah_sirkulasi BEFORE deletion
        const existingTembusanSirkulasi = await queryRunner.manager.find(
          NaskahSirkulasi,
          {
            where: { idNaskah: naskahId, sirkuler: 'tembusan' },
            order: { urutan: 'ASC' },
          },
        );
        if (existingTembusanSirkulasi?.length > 0) {
          tembusanPositionsToInsert = existingTembusanSirkulasi
            .map((t) => parseInt(t.position || '0', 10))
            .filter((p) => p > 0);
        }
      }

      // Delete existing tembusan sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      });

      // Re-insert tembusan if any with urutan
      if (tembusanPositionsToInsert.length > 0) {
        const orgDataForTembusan = await this.orgDataService.findOrg(tanggal);
        if (orgDataForTembusan?.position_json) {
          const barisDataTembusan = orgDataForTembusan.position_json;
          for (let i = 0; i < tembusanPositionsToInsert.length; i++) {
            const posId = tembusanPositionsToInsert[i];
            const tembusanPos = barisDataTembusan.find(
              (x: any) => Number(x.position) === Number(posId),
            );
            if (tembusanPos) {
              const tembusanSirkulasi = await this.createSirkulasiFromOrgData(
                naskahId,
                'tembusan',
                tembusanPos,
                false,
                i,
              );
              await queryRunner.manager.save(tembusanSirkulasi);

              // Send notification to tembusan internal (finalized naskah)
              const finalPerihal = dto.perihal ?? naskah.perihal ?? '';
              const finalPengirimName =
                finalPengirimPosition?.persnum_person_text ||
                finalPengirimPosition?.position_text ||
                existingPengirim?.namaSirkuler ||
                '';
              const finalPengirimPositionText =
                finalPengirimPosition?.position_text ||
                existingPengirim?.positionText ||
                '';
              this.notificationService
                .createNaskahMasukNotification({
                  positionId: String(tembusanPos.position),
                  userPersnum: tembusanPos.persnum_person
                    ? Number(tembusanPos.persnum_person)
                    : undefined,
                  naskahId,
                  sirkulasiId: tembusanSirkulasi.id,
                  jenis: 'SDE',
                  nomor: nomorSurat,
                  perihal: finalPerihal,
                  pengirim: finalPengirimName,
                  pengirimPosition: finalPengirimPositionText,
                  isTembusan: true,
                })
                .catch((err) =>
                  console.error(
                    '[SuratDinasEksternal:Finalize] Failed to send notification to tembusan:',
                    err,
                  ),
                );
            }
          }
        }
      }

      // PHASE 8.2: Handle sirkulasi penerima eksternal - ALWAYS ensure consistency
      // Delete existing penerima sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, {
        idNaskah: naskahId,
        sirkuler: 'penerima',
      });

      // Re-insert penerima eksternal if any with urutan (use list from DTO or existing)
      if (penerimaList && penerimaList.length > 0) {
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = await this.createSirkulasiFromEksternal(
            naskahId,
            penerima,
            false,
            i,
          );
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // PHASE 9: Update lampiran if provided
      if (dto.lampiran_files !== undefined) {
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            tanggal: naskah.tanggal,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 10: Auto-generate PDF with Digital Signature
      let finalPdfPath: string | undefined = undefined;
      let pdfBuffer: Buffer;
      let signatureMetadata: string | null = null;
      let bsreNameDoc: string | null = null;

      try {
        // Get pengirim sirkulasi for fallback data
        const pengirimSirkulasiForPdf = await queryRunner.manager.findOne(
          NaskahSirkulasi,
          {
            where: { idNaskah: naskahId, sirkuler: 'pengirim' },
          },
        );

        // Get updated naskah for fallback
        const updatedNaskahForPdf = await queryRunner.manager.findOne(
          NaskahEntity,
          { where: { id: naskahId } },
        );

        // Get penerima eksternal from sirkulasi (with proper urutan) for PDF
        const penerimaListForPdf = await queryRunner.manager.find(
          NaskahSirkulasi,
          {
            where: { idNaskah: naskahId, sirkuler: 'penerima' },
            order: { urutan: 'ASC', createdAt: 'ASC' },
          },
        );
        const kepadaYthListForPdf = penerimaListForPdf.map(
          (p) => p.namaSirkuler || '',
        );

        // Get tembusan from sirkulasi (with proper urutan) for PDF
        const tembusanListForPdf = await queryRunner.manager.find(
          NaskahSirkulasi,
          {
            where: { idNaskah: naskahId, sirkuler: 'tembusan' },
            order: { urutan: 'ASC', createdAt: 'ASC' },
          },
        );
        const tembusanForPdfFinal = tembusanListForPdf.map((t) =>
          `${t.positionText} ${t.organizationText}`.trim(),
        );

        // Get lampiran files for merging
        const lampiranFilesForPdf = await queryRunner.manager.find(
          NaskahLampiranEntity,
          {
            where: { id_naskah: naskahId },
          },
        );
        const lampiranTextForPdf =
          lampiranFilesForPdf.length > 0
            ? lampiranFilesForPdf.map((l) => l.file_name).join(', ')
            : updatedNaskahForPdf?.lampiran || '-';

        // Get tanggal for PDF
        const tanggalHariIni =
          naskah.tanggal instanceof Date ? naskah.tanggal : new Date();

        // Resolve position text and nama (from pengirimSirkulasiForPdf, no more sdeData)
        const resolvedPositionText =
          dto.nama_jabatan ||
          finalPengirimPosition?.position_text ||
          pengirimSirkulasiForPdf?.positionText ||
          '';
        const resolvedNamaLengkap =
          dto.nama_lengkap ||
          finalPengirimPosition?.persnum_person_text ||
          finalPengirimPosition?.nama ||
          pengirimSirkulasiForPdf?.namaSirkuler ||
          '';

        // Get dynamic header info dari sub_area_alamat berdasarkan pengirim context
        const tanggalStr =
          dto.tgl ||
          (naskah.tanggal instanceof Date
            ? this.formatDateToString(naskah.tanggal)
            : String(naskah.tanggal).split('T')[0]);
        const headerInfo = await this.getHeaderInfoByUser(
          {
            company: COMPANY_ID, // Use default company ID
            area:
              finalPengirimPosition?.area ??
              pengirimSirkulasiForPdf?.area ??
              undefined,
            subArea:
              finalPengirimPosition?.sub_area != null
                ? String(finalPengirimPosition.sub_area)
                : (pengirimSirkulasiForPdf?.subArea ?? undefined),
          },
          tanggalStr,
        );

        // Use kota from headerInfo if available (fallback to naskah.tempat or default)
        const dynamicNamaTempat =
          headerInfo?.kota ||
          dto.nama_tempat ||
          updatedNaskahForPdf?.tempat ||
          finalPengirimPosition?.sub_area_text ||
          'Tangerang';

        // ========================================
        // SIGNING: Prepare QR code SEBELUM generate PDF
        // ========================================
        const signerName = resolvedNamaLengkap || 'Penandatangan';
        const signerJabatan = resolvedPositionText || 'Jabatan';
        let qrCodeHtml: string | undefined = undefined;
        let signatureId: string | undefined = undefined;
        let signedAt: string | undefined = undefined;
        let verificationUrl: string | undefined = undefined;

        console.log(
          `[SDE finalizeDraft] Phase 10 - Preparing signing, sign_option: ${dto.sign_option}, persnum: ${persnum}`,
        );

        // Pre-generate QR code untuk digsig atau qr_only SEBELUM generate PDF
        if (
          (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) ||
          dto.sign_option === SignOption.QR_ONLY
        ) {
          signedAt = new Date().toISOString();
          signatureId = generateSignatureId();
          verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

          const qrData: QRCodeData = {
            signature_id:
              dto.sign_option === SignOption.DIGSIG ? signatureId : '',
            document_number: nomorSurat,
            signed_at: signedAt,
            signer_name: signerName,
            signer_jabatan: signerJabatan,
            document_type: 'Surat Dinas Eksternal',
            verification_url:
              dto.sign_option === SignOption.DIGSIG
                ? verificationUrl
                : undefined,
          };

          // Generate QR Code sebagai base64 HTML untuk template
          console.log(
            `[SDE finalizeDraft] Generating QR Code HTML for template`,
          );
          const qrBase64 =
            await this.qrCodeService.generateQRCodeBase64(qrData);
          qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
          console.log(
            `[SDE finalizeDraft] QR Code HTML generated successfully`,
          );
        }

        // Generate PDF dengan QR code di template (jika ada)
        console.log(
          `[SDE finalizeDraft] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`,
        );
        pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: Buffer.from(
            dto.konten || updatedNaskahForPdf?.konten || naskah.konten || '',
            'utf-8',
          ).toString('base64'),
          penerima: kepadaYthListForPdf,
          nama_tempat: dynamicNamaTempat,
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: resolvedPositionText,
          namaLengkap: resolvedNamaLengkap,
          tembusan: tembusanForPdfFinal, // Include tembusan in PDF (from sirkulasi with proper urutan)
          perihal:
            dto.perihal || updatedNaskahForPdf?.perihal || naskah.perihal || '',
          sifat: dto.sifat || updatedNaskahForPdf?.sifat || 'Biasa',
          nomor: nomorSurat,
          lampiran: lampiranTextForPdf,
          // Dynamic header info dari sub_area_alamat
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML - akan ditampilkan di template di antara jabatan dan nama
          qrCodeHtml: qrCodeHtml,
          // English format flag
          english: dto.english === true,
        });
        console.log(`[SDE finalizeDraft] PDF generated successfully`);

        // Merge with lampiran if any
        if (lampiranFilesForPdf && lampiranFilesForPdf.length > 0) {
          const filesToMerge = lampiranFilesForPdf.map((l) => ({
            id: l.id,
            fileName: l.file_name,
            filePath: l.file_pdf,
            tempFolderId: l.temp_folder_id,
          }));
          pdfBuffer = await this.mergePdfWithTemporaryFiles(
            pdfBuffer,
            filesToMerge,
          );
          console.log(
            '[SDE finalizeDraft] Merged with',
            filesToMerge.length,
            'lampiran files',
          );
        }

        // ========================================
        // PHASE 11: Process BSrE signing (jika digsig)
        // ========================================
        if (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) {
          console.log(
            `[SDE finalizeDraft] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`,
          );

          // 11a. Fetch NIK dan no_wa dari HR API via DigsigService
          console.log(
            `[SDE finalizeDraft] Step 11a - Fetching user data for persnum: ${persnum}`,
          );
          const userData = await this.digsigService.getUserDataForBsre(
            persnum.toString(),
          );
          console.log(`[SDE finalizeDraft] Step 11a - Got userData:`, {
            nik: userData.nik,
            no_wa: userData.no_wa,
          });

          // 11b. Upload PDF (dengan QR) ke temp untuk BSrE signing
          console.log(
            `[SDE finalizeDraft] Step 11b - Uploading temp PDF for BSrE`,
          );
          const tempTimestamp = Date.now();
          const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
          const tempUpload = await this.storageService.uploadBuffer(
            pdfBuffer,
            tempFileName,
            'application/pdf',
            'surat-dinas-eksternal/temp',
          );
          console.log(
            `[SDE finalizeDraft] Step 11b - Temp PDF uploaded: ${tempUpload.key}`,
          );

          // 11c. Hit BSrE API untuk digital signature
          console.log(`[SDE finalizeDraft] Step 11c - Hitting BSrE API`);
          const bsreResponse = await this.digsigService.hitDigsigEndpoint(
            {
              key: tempUpload.key,
              filename: tempFileName,
              nomorDokumen: nomorSurat,
              tanggalDokumen: this.formatDateToString(tanggalHariIni),
              klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
              jenisNaskah: 'Surat Dinas Eksternal',
              perihal: dto.perihal || naskah.perihal || '',
              nik: userData.nik,
              passphrase: dto.passphrase!,
              path_dokumen: 'surat-dinas-eksternal/digsig/',
              no_wa: userData.no_wa,
            },
            {
              userPersnum: persnum,
              userName: signerName || 'User',
              idNaskah: naskahId,
              jenisNaskah: 'SDE',
            },
          );
          console.log(
            `[SDE finalizeDraft] Step 11c - BSrE response:`,
            JSON.stringify(bsreResponse, null, 2),
          );

          // 11d. Extract name_doc from BSrE response (krusial untuk verifikasi)
          bsreNameDoc =
            bsreResponse?.name_doc?.[0] ||
            bsreResponse?.data?.name_doc?.[0] ||
            null;
          console.log(
            `[SDE finalizeDraft] Step 11d - BSrE name_doc: ${bsreNameDoc}`,
          );

          // 11e. Build signature metadata
          signatureMetadata = formatSignatureData({
            type: 'digsig',
            doc_id: bsreResponse?.doc_id || bsreResponse?.data?.doc_id,
            signature_id: signatureId!,
            signed_at: signedAt!,
            signer_nik: userData.nik,
            signer_name: signerName,
            signer_jabatan: signerJabatan,
            path: null, // Will be updated after upload
            verification_url: verificationUrl!,
            bsre_name_doc: bsreNameDoc, // Simpan name_doc untuk verifikasi
          });
          console.log(
            `[SDE finalizeDraft] Step 11e - Signature metadata built`,
          );

          // 11f. Cleanup temp file
          try {
            await this.storageService.deleteFile(tempUpload.key);
          } catch (e) {
            console.warn(
              `[SDE finalizeDraft] Failed to cleanup temp file: ${e.message}`,
            );
          }

          // 11g. Download signed PDF from digsig/ and upload to final/
          if (bsreNameDoc) {
            console.log(
              `[SDE finalizeDraft] Step 11g - Downloading signed PDF from digsig/`,
            );
            const digsigPath = `surat-dinas-eksternal/digsig/${bsreNameDoc}`;
            try {
              const signedPdfBuffer =
                await this.storageService.getFile(digsigPath);
              console.log(
                `[SDE finalizeDraft] Step 11g - Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`,
              );
              // Replace pdfBuffer with signed version
              pdfBuffer = signedPdfBuffer;
            } catch (e) {
              console.warn(
                `[SDE finalizeDraft] Step 11g - Failed to download signed PDF from digsig/, will use original: ${e.message}`,
              );
            }
          }
        } else if (dto.sign_option === SignOption.QR_ONLY) {
          // ========================================
          // QR Code tanpa Digital Signature
          // QR sudah ada di template, tidak perlu BSrE, tidak ada metadata
          // ========================================
          console.log(
            `[SDE finalizeDraft] QR_ONLY mode - QR already in template, no BSrE signing needed`,
          );
          // signatureMetadata tetap null
        }
        // OPTION 3: TTD_BASAH - tidak ada QR, space untuk tanda tangan manual

        // PHASE 12: Upload final PDF
        const timestamp = Date.now();
        const pdfFileName = `SDE-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'surat-dinas-eksternal/final',
        );

        finalPdfPath = uploadResult.key;
        // Store to outer scope for response
        finalPdfPathResult = finalPdfPath;
        bsreNameDocResult = bsreNameDoc;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update nomor_request_detail dengan file PDF yang sudah di-generate
        await queryRunner.manager
          .createQueryBuilder()
          .update('nomor_request_detail')
          .set({
            fileName: pdfFileName,
            fileText: finalPdfPath,
          })
          .where('nomor = :nomor', { nomor: nomorSurat })
          .andWhere('status = :status', { status: 'terpakai_final' })
          .execute();

        // Update naskah with tanda_tangan metadata (if digsig)
        if (signatureMetadata) {
          // Update path in metadata
          const metadataObj = JSON.parse(signatureMetadata);
          metadataObj.path = finalPdfPath;
          signatureMetadata = JSON.stringify(metadataObj);

          await queryRunner.manager.update(
            NaskahEntity,
            { id: naskahId },
            { tandaTangan: signatureMetadata },
          );
        }

        console.log('[SDE finalizeDraft] PDF auto-generated:', finalPdfPath);
      } catch (error) {
        console.error(
          '[SDE finalizeDraft] Failed to auto-generate PDF:',
          error,
        );
        // CRITICAL: Throw error jika signing gagal - jangan simpan naskah tanpa signature
        throw new BadRequestException(
          `Gagal proses PDF/signing: ${error.message || 'Unknown error'}`,
        );
      }

      // Close konsep workflow if this naskah asli originated from a konsep
      // (is_konsep=0 on sirkulasi for dashboard counts + 'finalize' riwayat node).
      await this.konsepService.closeKonsepWorkflow(naskahId, queryRunner);

      // Commit transaction
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    let portalRedirect:
      | { transactionId: string; signingUrl: string }
      | undefined;
    if (isPortalMode) {
      if (!portalUser || !finalPdfPathResult) {
        throw new BadRequestException(
          'Konteks pengguna atau PDF SDE untuk Portal TTE tidak lengkap',
        );
      }
      const portal = await this.tteSigningService.createSigningTransaction({
        sourceKey: finalPdfPathResult,
        filename: finalPdfPathResult.split('/').pop() || `SDE-${naskahId}.pdf`,
        pathDokumen: 'surat-dinas-eksternal/digsig/',
        idNaskah: naskahId,
        jenisNaskah: 'SDE',
        nomorNaskah: nomorSurat,
        location: dto.nama_tempat || naskah.tempat || 'Indonesia',
        reason: `Penandatanganan Surat Dinas Eksternal ${nomorSurat}`,
        user: portalUser,
      });
      portalRedirect = {
        transactionId: portal.transactionId,
        signingUrl: portal.signingUrl,
      };
    }

    // PHASE 11: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    // If finalPengirimPosition is not available (dto.pengirim not provided),
    // lookup from org_data using sirkulasi.position for fallback
    let fallbackPengirimPosition = finalPengirimPosition;
    if (!fallbackPengirimPosition && pengirimSirkulasi?.position) {
      const orgDataForFallback = await this.orgDataService.findOrg(tanggal);
      if (orgDataForFallback?.position_json) {
        fallbackPengirimPosition = orgDataForFallback.position_json.find(
          (x: SdeOrgDataPositionDto) =>
            Number(x.position) === Number(pengirimSirkulasi.position),
        );
      }
    }

    // Get penerima from naskah_sirkulasi (penerima eksternal)
    const penerimaListForResponse = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'penerima' },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });
    const penerimaResponses: SdePenerimaInfoDto[] = [];
    for (const penerima of penerimaListForResponse) {
      if (penerima.idSirkuler) {
        const ext = await this.eksternalRepository.findOne({
          where: { id: penerima.idSirkuler, aktif: true },
        });
        if (ext) {
          penerimaResponses.push(this.toEksternalPenerimaInfo(ext));
        }
      }
    }

    // Get lampiran file names for response
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranText =
      lampiranList.length > 0
        ? lampiranList.map((l) => l.file_name).join(', ')
        : undefined;

    // Get tembusan directly from naskah_sirkulasi table
    const finalizeTembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    // Build tembusan info
    const finalizeTembusanResponses: SdeSirkulasiInfoDto[] =
      finalizeTembusanList.map((t) => ({
        position: parseInt(t.position || '0', 10),
        position_text: t.positionText || '',
        persnum: parseInt(t.idSirkuler || '0', 10),
        nama: t.namaSirkuler || '',
        organization_id: parseInt(t.organization || '0', 10),
        organization_text: t.organizationText || '',
        sub_area: parseInt(t.subArea || '0', 10),
        sub_area_text: t.subAreaText || '',
        area: t.area || '',
        area_text: t.areaText || '',
      }));

    // Get final PDF path from updated naskah
    const finalPdfPathForResponse = updatedNaskah?.final_pdf || null;

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = this.formatDateToString(updatedNaskah.tanggal);
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
        // Use toSirkulasiInfo directly from org_data (same as SDI)
        pengirim: fallbackPengirimPosition
          ? this.toSirkulasiInfo(fallbackPengirimPosition)
          : {
              position: parseInt(pengirimSirkulasi?.position || '0', 10),
              position_text: pengirimSirkulasi?.positionText || '',
              persnum: pengirimSirkulasi?.idSirkuler
                ? parseInt(pengirimSirkulasi.idSirkuler, 10)
                : null,
              nama: pengirimSirkulasi?.namaSirkuler || null,
              organization_id: parseInt(
                pengirimSirkulasi?.organization || '0',
                10,
              ),
              organization_text: pengirimSirkulasi?.organizationText || '',
              sub_area: pengirimSirkulasi?.subArea
                ? parseInt(pengirimSirkulasi.subArea, 10)
                : null,
              sub_area_text: pengirimSirkulasi?.subAreaText || null,
              area: pengirimSirkulasi?.area || null,
              area_text: pengirimSirkulasi?.areaText || null,
            },
        penerima: penerimaResponses,
        tembusan: finalizeTembusanResponses, // Always return array (empty or filled)
        lampiran: lampiranText, // Nama file lampiran dari database
        final_pdf: finalPdfPathResult || finalPdfPathForResponse, // Path file PDF final (null if not generated)
        // Additional fields untuk digsig (match send-message response)
        sign_option: dto.sign_option,
        bsre_name_doc: bsreNameDocResult,
        tte_redirect: portalRedirect,
      } as any,
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
      (pos: SdeOrgDataPositionDto) =>
        Number(pos.position) === Number(positionId),
    );

    if (!positionData) {
      throw new NotFoundException(
        `Position dengan id ${positionId} tidak ditemukan di org_data`,
      );
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

      // Get penerima eksternal from naskah_sirkulasi (with proper urutan)
      const penerimaListSirkulasi = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
        order: { urutan: 'ASC', createdAt: 'ASC' },
      });

      // Build penerima info from sirkulasi
      const penerimaList: SdePenerimaInfoDto[] = penerimaListSirkulasi.map(
        (p) => ({
          id: p.idSirkuler || '',
          nama: p.namaSirkuler || '',
          alamat: p.alamat || '',
          telepon: p.telepon || '',
          email: p.email || '',
          kontak: '',
        }),
      );

      // Get tembusan sirkulasi
      const tembusanList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'tembusan',
        },
        order: { urutan: 'ASC', createdAt: 'ASC' },
      });

      // Build tembusan info
      const tembusanInfoList = tembusanList.map((t) => ({
        position: parseInt(t.position || '0', 10),
        position_text: t.positionText || '',
        persnum: parseInt(t.idSirkuler || '0', 10),
        nama: t.namaSirkuler || '',
        organization_id: parseInt(t.organization || '0', 10),
        organization_text: t.organizationText || '',
        sub_area: parseInt(t.subArea || '0', 10),
        sub_area_text: t.subAreaText || '',
        area: t.area || '',
        area_text: t.areaText || '',
      }));

      // Format tanggal
      const tanggalStr =
        naskah.tanggal instanceof Date
          ? naskah.tanggal.toISOString().split('T')[0]
          : String(naskah.tanggal || '').split('T')[0];

      results.push({
        id: naskah.id,
        jenis: naskah.jenis || 'SDE',
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        status: naskah.status,

        // Kop Naskah (dead code - removed, return null for compatibility)
        kop_logo: null,
        kop_nama: null,
        alamat_perusahaan: null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh - konten from naskah
        konten: naskah.konten || null,

        // Kaki - from pengirimSirkulasi and naskah
        nama_tempat: naskah.tempat || null,
        nama_jabatan: pengirimSirkulasi?.positionText || null,
        tanda_tangan: naskah.tanda_tangan || null, // from naskah.tandaTangan
        nama_lengkap: pengirimSirkulasi?.namaSirkuler || null,

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
        tembusan: tembusanInfoList, // Always return array (empty or filled)

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

  // ============================================================
  // GET DETAIL BY ID
  // ============================================================

  /**
   * Get SDE detail by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   */
  async getSdeDetail(naskahId: string, userPosition: string): Promise<any> {
    await this.assertUserHasAccessToNaskah(naskahId, userPosition);

    // Get naskah data
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.jenis !== 'SDE') {
      throw new NotFoundException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    // Get pengirim sirkulasi
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        sirkuler: 'pengirim',
      },
    });

    // Get penerima eksternal from naskah_sirkulasi (with proper urutan)
    const penerimaListSirkulasi = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'penerima',
      },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    // Build penerima info from sirkulasi
    const penerimaInfoList: any[] = penerimaListSirkulasi.map((p) => ({
      id: p.idSirkuler || '',
      nama: p.namaSirkuler || '',
      alamat: p.alamat || '',
      telepon: p.telepon || '',
      email: p.email || '',
      kontak: '',
      company: p.companyText || '',
      area: p.areaText || '',
    }));

    // Get tembusan sirkulasi
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    // Build tembusan info
    const tembusanInfoList = tembusanList.map((t) => ({
      position: parseInt(t.position || '0', 10),
      position_text: t.positionText || '',
      persnum: parseInt(t.idSirkuler || '0', 10),
      nama: t.namaSirkuler || '',
      organization_id: parseInt(t.organization || '0', 10),
      organization_text: t.organizationText || '',
      sub_area: parseInt(t.subArea || '0', 10),
      sub_area_text: t.subAreaText || '',
      area: t.area || '',
      area_text: t.areaText || '',
    }));

    // Get lampiran files
    const lampiranFiles = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // Format tanggal
    const tanggalStr =
      naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal || '').split('T')[0];

    // Build lampiran info with file URL
    const lampiranInfoList = await Promise.all(
      lampiranFiles.map(async (l) => ({
        id: l.id,
        fileName: l.file_name || '',
        filePath: l.file_pdf || '',
        fileUrl: l.file_pdf
          ? await this.storageService.getFileUrl(l.file_pdf)
          : null,
      })),
    );

    // Get final PDF URL if exists
    const finalPdfUrl = naskah.final_pdf
      ? await this.storageService.getFileUrl(naskah.final_pdf)
      : null;

    // Build response
    return {
      success: true,
      data: {
        // Naskah info
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        status: naskah.status,
        perihal: naskah.perihal,
        lampiran: naskah.lampiran || null,
        english: !!naskah.english,

        // SDE specific info - kepada_yth built from penerima names
        kepada_yth: penerimaInfoList.map((p) => p.nama).join('; '),
        alamat:
          penerimaInfoList.length === 1 ? penerimaInfoList[0].alamat : null,

        // Kop (dead code - removed, return null for compatibility)
        kop_logo: null,
        kop_nama: null,
        alamat_perusahaan: null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',

        // Body - konten from naskah
        konten: naskah.konten || null,

        // Footer - from pengirimSirkulasi and naskah
        nama_tempat: naskah.tempat || null,
        nama_jabatan: pengirimSirkulasi?.positionText || null,
        tanda_tangan: naskah.tandaTangan || null,
        nama_lengkap: pengirimSirkulasi?.namaSirkuler || null,
        // Garis Kewenangan (a.n.) — label pemberi kuasa (null = tanpa a.n.)
        atas_nama: naskah.atasNama || null,
        atas_nama_position_id: naskah.atasNamaPositionId || null,

        // Sirkulasi
        pengirim: {
          id: pengirimSirkulasi?.id || '',
          persnum: pengirimSirkulasi
            ? parseInt(pengirimSirkulasi.idSirkuler || '0', 10)
            : 0,
          nama: pengirimSirkulasi?.namaSirkuler || '',
          positionText: pengirimSirkulasi?.positionText || '',
          organizationText: pengirimSirkulasi?.organizationText || '',
          subAreaText: pengirimSirkulasi?.subAreaText || '',
          areaText: pengirimSirkulasi?.areaText || '',
        },
        penerima: penerimaInfoList,
        tembusan: tembusanInfoList, // Always return array (empty or filled)

        // Files
        lampiran_files: lampiranInfoList,
        final_pdf: naskah.final_pdf || null,
        final_pdf_url: finalPdfUrl,

        // Metadata
        created_at: pengirimSirkulasi?.createdAt || null,
        updated_at: pengirimSirkulasi?.updatedAt || null,
      },
    };
  }

  /**
   * Kirim SDE via email ke penerima eksternal
   * Mengambil PDF final + lampiran dari S3, lalu kirim via mail-service
   */
  async sendSdeEmail(
    naskahId: string,
    userPosition: string,
    userPersnum: number,
    senderNama: string,
    dto: {
      to: string;
      cc?: string;
      bcc?: string;
      from_as?: string;
      lampiran_ids?: string[];
    },
  ): Promise<any> {
    await this.assertUserHasAccessToNaskah(naskahId, userPosition);

    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });
    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal (SDE)');
    }
    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Surat belum memiliki PDF final. Pastikan surat sudah ditandatangani.',
      );
    }

    // Ambil PDF final sebagai buffer dari S3
    const pdfBuffer = await this.storageService.getFile(naskah.final_pdf);
    const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

    // Build lampiran array — HANYA final_pdf (sudah merge dengan lampiran).
    // ponytail: final_pdf SDE sudah di-merge dengan lampiran saat generate.
    // Kalau lampiran terpisah juga di-attach → duplikat di email penerima.
    const lampiran: any[] = [
      {
        filename: `${naskah.nomor || naskah.perihal || 'Surat'}.pdf`.replace(
          /[/\\?%*:|"<>]/g,
          '_',
        ),
        filebase64: pdfBase64,
      },
    ];

    // Build email payload
    const emailPayload = {
      subjek: `${naskah.perihal || naskah.nomor || naskahId}`,
      from_as: dto.from_as || 'ARSIPKU',
      to: dto.to,
      konten: `<p>Yth. Bapak/Ibu,</p><br><p>Bersama email ini kami sampaikan dokumen korespondensi dari AirNav Indonesia</p><p>Untuk informasi lebih lanjut, mohon dapat mengacu pada dokumen terlampir sesuai kebutuhan tindak lanjut.</p><p>Email ini dikirim secara otomatis melalui sistem korespondensi AirNav Indonesia dan tidak memerlukan balasan. (No Reply)</p><p>Atas perhatian dan kerja sama yang diberikan, kami ucapkan terima kasih.</p><br><p>Hormat kami,</p><p>AirNav Indonesia</p>`,
      cc: dto.cc || '',
      bcc: dto.bcc || '',
      lampiran,
    };

    // Kirim via mail-service (base64 endpoint karena lampiran dalam base64)
    const result = await this.mailServiceService.sendMailBase64(
      emailPayload,
      userPersnum,
      {
        naskah_id: naskahId,
        jenis_naskah: 'SDE',
        nomor_surat: naskah.nomor || undefined,
        perihal: naskah.perihal || undefined,
        sender_persnum: String(userPersnum),
        sender_nama: senderNama || undefined,
      },
    );

    return {
      success: true,
      message: 'Email berhasil dikirim',
      data: result,
    };
  }

  /**
   * Simpan draft email SDE di mail server AirNav
   * Menggunakan endpoint /mail/draft dengan payload sama seperti sendSdeEmail
   */
  async saveSdeEmailDraft(
    naskahId: string,
    userPosition: string,
    userPersnum: number,
    senderNama: string,
    dto: {
      to: string;
      cc?: string;
      bcc?: string;
      from_as?: string;
      lampiran_ids?: string[];
    },
  ): Promise<any> {
    await this.assertUserHasAccessToNaskah(naskahId, userPosition);

    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });
    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal (SDE)');
    }
    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Surat belum memiliki PDF final. Pastikan surat sudah ditandatangani.',
      );
    }

    // Ambil PDF final sebagai buffer dari S3
    const pdfBuffer = await this.storageService.getFile(naskah.final_pdf);
    const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

    // Build lampiran array — HANYA final_pdf (sudah merge dengan lampiran).
    // ponytail: final_pdf SDE sudah di-merge dengan lampiran saat generate.
    // Kalau lampiran terpisah juga di-attach → duplikat di email penerima.
    const lampiran: any[] = [
      {
        filename: `${naskah.nomor || naskah.perihal || 'Surat'}.pdf`.replace(
          /[/\\?%*:|"<>]/g,
          '_',
        ),
        filebase64: pdfBase64,
      },
    ];

    // Build email payload
    const emailPayload = {
      subjek: `${naskah.perihal || naskah.nomor || naskahId}`,
      from_as: dto.from_as || 'ARSIPKU',
      to: dto.to,
      konten: `<p>Yth. Bapak/Ibu,</p><br><p>Bersama email ini kami sampaikan dokumen korespondensi dari AirNav Indonesia</p><p>Untuk informasi lebih lanjut, mohon dapat mengacu pada dokumen terlampir sesuai kebutuhan tindak lanjut.</p><p>Email ini dikirim secara otomatis melalui sistem korespondensi AirNav Indonesia dan tidak memerlukan balasan. (No Reply)</p><p>Atas perhatian dan kerja sama yang diberikan, kami ucapkan terima kasih.</p><br><p>Hormat kami,</p><p>AirNav Indonesia</p>`,
      cc: dto.cc || '',
      bcc: dto.bcc || '',
      lampiran,
    };

    // Simpan draft via mail-service (/mail/draft)
    const result = await this.mailServiceService.saveDraft(
      emailPayload,
      userPersnum,
      {
        naskah_id: naskahId,
        jenis_naskah: 'SDE',
        nomor_surat: naskah.nomor || undefined,
        perihal: naskah.perihal || undefined,
        sender_persnum: String(userPersnum),
        sender_nama: senderNama || undefined,
      },
    );

    return {
      success: true,
      message: 'Draft email berhasil disimpan',
      data: result,
    };
  }

  private async assertUserHasAccessToNaskah(
    naskahId: string,
    userPosition: string,
  ): Promise<void> {
    const access = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        position: String(userPosition),
      },
      select: { id: true },
    });

    if (!access) {
      throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
    }
  }

  /**
   * FORWARD: Create new document from existing one
   * Support document type transformation (SDE ↔ ND/SDI)
   *
   * 11 Phases:
   * 1. Validasi naskah referensi exists
   * 2. Get org_data dan validasi pengirim & penerima
   * 3. Generate nomor baru sesuai jenis
   * 4. Create naskah baru dengan jenis
   * 5. Create naskah_referensi ke naskah asal
   * 6. Create entity content (sesuai jenis)
   * 7. Create sirkulasi pengirim & penerima
   * 8. Handle lampiran
   * 9. Generate PDF
   *
   * @param dto - ForwardSuratDinasEksternalDto
   * @param user - Optional current user from JWT
   * @returns Response dengan referensi data
   */
  async forwardSuratDinasEksternal(dto: any, user?: any): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 1: Validasi naskah referensi exists
      const naskahDiterima = await this.naskahRepository.findOne({
        where: { id: dto.id_naskah_referensi },
      });

      if (!naskahDiterima) {
        throw new NotFoundException(
          `Naskah dengan ID ${dto.id_naskah_referensi} tidak ditemukan`,
        );
      }

      if (!['ND', 'SDI', 'SDE'].includes(naskahDiterima.jenis || '')) {
        throw new BadRequestException(
          `Naskah dengan ID ${dto.id_naskah_referensi} bukan naskah dinas (jenis: ${naskahDiterima.jenis})`,
        );
      }

      // PHASE 2: Get org_data dan validasi pengirim & penerima
      const tanggal = new Date().toISOString().split('T')[0];
      const orgData = await this.orgDataService.findOrg(tanggal);

      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan`,
        );
      }

      const barisData: any[] = orgData.position_json;

      // Validasi pengirim
      const pengirim = barisData.find(
        (x) => Number(x.position) === Number(dto.pengirim),
      );

      if (!pengirim) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim} tidak ditemukan`,
        );
      }

      // For SDE, pengirim doesn't need to be managerial
      // Validasi semua penerima
      const penerimaList: any[] = [];
      for (const posId of dto.penerima) {
        const penerima = barisData.find(
          (x) => Number(x.position) === Number(posId),
        );
        if (!penerima) {
          throw new NotFoundException(
            `Penerima dengan position_id ${posId} tidak ditemukan`,
          );
        }
        penerimaList.push(penerima);
      }

      // Validasi tembusan (jika ada)
      const tembusanList: any[] = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const posId of dto.tembusan) {
          const tembusan = barisData.find(
            (x) => Number(x.position) === Number(posId),
          );
          if (!tembusan) {
            throw new NotFoundException(
              `Tembusan dengan position_id ${posId} tidak ditemukan`,
            );
          }
          tembusanList.push(tembusan);
        }
      }

      // PHASE 4: Generate nomor surat baru sesuai jenis
      const naskahId = uuidv4();
      const tanggalNaskah = new Date();
      const perihal = dto.perihal || naskahDiterima.perihal || '';
      const konten = dto.konten || naskahDiterima.konten || '';
      const klasifikasi = dto.klasifikasi || naskahDiterima.klasifikasi || '';

      // Generate nomor dengan jenis menggunakan internal method
      const nomorSurat = await this.generateNomorWithIntegration(
        pengirim,
        klasifikasi,
        perihal,
        tanggalNaskah,
        queryRunner,
      );

      // Calculate total lampiran count
      let totalLampiranCount = 0;
      if (dto.copy_lampiran_from_previous !== false) {
        totalLampiranCount += await this.naskahLampiranRepository.count({
          where: { id_naskah: dto.id_naskah_referensi },
        });
      }
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        totalLampiranCount += dto.lampiran_temp_ids.length;
      }

      // PHASE 5: Create naskah baru dengan jenis
      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: dto.jenis,
        klasifikasi: klasifikasi,
        klasifikasi_text:
          dto.klasifikasi_text || naskahDiterima.klasifikasi_text || undefined,
        sifat: dto.sifat,
        nomor: nomorSurat,
        tanggal: tanggalNaskah,
        perihal: perihal,
        konten: konten,
        status: 'final',
        lampiran:
          totalLampiranCount > 0 ? `${totalLampiranCount} file` : undefined,
        english: dto.english || false,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 6: Create naskah_referensi (link ke naskah asal)
      const naskahReferensi = queryRunner.manager.create(
        NaskahReferensiEntity,
        {
          id: uuidv4(),
          id_naskah: naskahId,
          tanggal: naskah.tanggal,
          ref_jenis: naskahDiterima.jenis as any,
          ref_pengirim: null,
          ref_tanggal: naskahDiterima.tanggal || null,
          ref_nomor: naskahDiterima.nomor || null,
          ref_perihal: naskahDiterima.perihal || null,
        },
      );
      await queryRunner.manager.save(naskahReferensi);

      // PHASE 7: Create entity content sesuai jenis
      const kepadaYthList = penerimaList.map(
        (p) => `${p.position_text} ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      // Get header info
      const headerInfo = await this.getHeaderInfoByUser(
        {
          company: pengirim.company || undefined,
          area: pengirim.area || undefined,
          subArea: pengirim.sub_area ? String(pengirim.sub_area) : undefined,
        },
        tanggal,
      );

      const kopLogo = dto.kop_logo || DEFAULT_KOP_LOGO;
      const kopNama = dto.kop_nama || headerInfo?.kantor || DEFAULT_KOP_NAMA;
      const alamatPerusahaan =
        dto.alamat_perusahaan ||
        headerInfo?.alamat ||
        DEFAULT_ALAMAT_PERUSAHAAN;
      const namaTempat =
        dto.nama_tempat || headerInfo?.gedung || pengirim.sub_area_text || '';
      const namaJabatan = dto.nama_jabatan || pengirim.position_text || '';
      const namaLengkap =
        dto.nama_lengkap || pengirim.persnum_person_text || '';

      // PHASE 7: (REMOVED) - NdEntity/SdiSdeEntity tidak lagi digunakan
      // Field tandaTangan disimpan langsung di NaskahEntity saat pembuatan naskah di atas
      // Field lain (nama_jabatan, nama_lengkap, dll) diambil dari naskah_sirkulasi

      // PHASE 8: Create sirkulasi pengirim
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        tanggal: naskah.tanggal,
        sirkuler: 'pengirim',
        company: String(pengirim.company || COMPANY_ID),
        companyText: 'PERUM LPPNPI',
        area: pengirim.area || '',
        areaText: pengirim.area_text || '',
        subArea: pengirim.sub_area ? String(pengirim.sub_area) : '',
        subAreaText: pengirim.sub_area_text || '',
        organization: String(pengirim.organization_id),
        organizationText: pengirim.organization_text,
        position: String(pengirim.position),
        positionText: pengirim.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirim.persnum_person
          ? String(pengirim.persnum_person)
          : '',
        namaSirkuler: pengirim.persnum_person_text || '',
        isDraft: false,
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 9: Create sirkulasi penerima & tembusan
      const penerimaResponses: any[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          tanggal: naskah.tanggal,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: 'PERUM LPPNPI',
          area: penerima.area || '',
          areaText: penerima.area_text || '',
          subArea: penerima.sub_area ? String(penerima.sub_area) : '',
          subAreaText: penerima.sub_area_text || '',
          organization: String(penerima.organization_id),
          organizationText: penerima.organization_text,
          position: String(penerima.position),
          positionText: penerima.position_text,
          positionStatus: 'ybs',
          idSirkuler: penerima.persnum_person
            ? String(penerima.persnum_person)
            : '',
          namaSirkuler: penerima.persnum_person_text || '',
          isDraft: false,
          urutan: i,
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push({
          position: penerima.position,
          position_text: penerima.position_text,
          persnum: penerima.persnum_person,
          nama: penerima.persnum_person_text,
          organization_id: penerima.organization_id,
          organization_text: penerima.organization_text,
          sub_area: penerima.sub_area,
          sub_area_text: penerima.sub_area_text,
          area: penerima.area,
          area_text: penerima.area_text,
        });
      }

      const tembusanResponses: any[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          tanggal: naskah.tanggal,
          sirkuler: 'tembusan',
          company: String(tembusan.company || COMPANY_ID),
          companyText: 'PERUM LPPNPI',
          area: tembusan.area || '',
          areaText: tembusan.area_text || '',
          subArea: tembusan.sub_area ? String(tembusan.sub_area) : '',
          subAreaText: tembusan.sub_area_text || '',
          organization: String(tembusan.organization_id),
          organizationText: tembusan.organization_text,
          position: String(tembusan.position),
          positionText: tembusan.position_text,
          positionStatus: 'ybs',
          idSirkuler: tembusan.persnum_person
            ? String(tembusan.persnum_person)
            : '',
          namaSirkuler: tembusan.persnum_person_text || '',
          isDraft: false,
          urutan: i,
        });
        await queryRunner.manager.save(tembusanSirkulasi);

        tembusanResponses.push({
          position: tembusan.position,
          position_text: tembusan.position_text,
          persnum: tembusan.persnum_person,
          nama: tembusan.persnum_person_text,
          organization_id: tembusan.organization_id,
          organization_text: tembusan.organization_text,
          sub_area: tembusan.sub_area,
          sub_area_text: tembusan.sub_area_text,
          area: tembusan.area,
          area_text: tembusan.area_text,
        });
      }

      // PHASE 10: Handle lampiran
      const lampiranResponses: any[] = [];

      // Option 1: Copy lampiran dari naskah sebelumnya
      if (dto.copy_lampiran_from_previous !== false) {
        const previousLampiran = await this.naskahLampiranRepository.find({
          where: { id_naskah: dto.id_naskah_referensi },
        });

        if (previousLampiran.length > 0) {
          for (const prevLamp of previousLampiran) {
            const newLampiran = this.naskahLampiranRepository.create({
              id: uuidv4(),
              id_naskah: naskahId,
              tanggal: naskah.tanggal,
              file_name: prevLamp.file_name,
              file_pdf: prevLamp.file_pdf,
              jenis: dto.jenis,
              is_temporary: 0,
            });
            await queryRunner.manager.save(newLampiran);

            lampiranResponses.push({
              id: newLampiran.id,
              nama_file: newLampiran.file_name,
              url: newLampiran.file_pdf,
            });
          }
        }
      }

      // Option 2: Lampiran TAMBAHAN dari temporary
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        const movedLampiran = await queryRunner.manager.find(
          NaskahLampiranEntity,
          {
            where: {
              id_naskah: naskahId,
              id: In(dto.lampiran_temp_ids),
            },
          },
        );

        for (const lamp of movedLampiran) {
          lampiranResponses.push({
            id: lamp.id,
            nama_file: lamp.file_name,
            url: lamp.file_pdf,
          });
        }
      }

      // PHASE 11: Generate PDF dengan lampiran
      let finalPdfPath: string | undefined = undefined;
      try {
        // Generate PDF
        let pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: konten,
          htmlContent: konten,
          nomor: nomorSurat,
          penerima: kepadaYthList,
          tembusan:
            tembusanList.length > 0
              ? tembusanList.map(
                  (t) => `${t.position_text} ${t.organization_text}`,
                )
              : [],
          perihal: perihal,
          tanggal: tanggalNaskah.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: namaJabatan,
          namaLengkap: namaLengkap,
          nama_tempat: namaTempat,
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          sifat: dto.sifat,
          // English format flag
          english: dto.english === true,
        });

        // Merge with lampiran if any
        if (lampiranResponses.length > 0) {
          const allLampiranIds = lampiranResponses.map((l) => l.id);
          const lampiranFiles =
            await this.getTemporaryLampiranFiles(allLampiranIds);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(
              pdfBuffer,
              lampiranFiles,
            );
          }
        }

        // Upload PDF to storage
        const timestamp = Date.now();
        const pdfFileName = `${dto.jenis}-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'surat-dinas-eksternal/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update nomor_request_detail dengan file PDF yang sudah di-generate
        await queryRunner.manager
          .createQueryBuilder()
          .update('nomor_request_detail')
          .set({
            fileName: pdfFileName,
            fileText: finalPdfPath,
          })
          .where('nomor = :nomor', { nomor: nomorSurat })
          .andWhere('status = :status', { status: 'terpakai_final' })
          .execute();

        console.log(`[SDE Forward] PDF generated: ${finalPdfPath}`);
      } catch (error) {
        console.error('[SDE Forward] Failed to generate PDF:', error);
      }

      // Auto mark tindak_lanjut = 1 pada sirkulasi penerima yang melakukan forward
      const sirkulasiPenerima = await queryRunner.manager.findOne(
        NaskahSirkulasi,
        {
          where: {
            idNaskah: dto.id_naskah_referensi,
            position: String(dto.pengirim),
            sirkuler: 'penerima',
          },
        },
      );
      if (sirkulasiPenerima) {
        await this.naskahSirkulasiService.markTindakLanjutById(
          sirkulasiPenerima.id,
          queryRunner.manager,
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Return response
      return {
        status: 'success',
        message: 'Naskah dinas berhasil di-forward',
        data: {
          naskah: {
            id: naskahId,
            jenis: dto.jenis,
            nomor: nomorSurat,
            tanggal: tanggalNaskah,
            perihal: perihal,
          },
          referensi: {
            ref_jenis: naskahDiterima.jenis,
            ref_nomor: naskahDiterima.nomor,
            ref_tanggal: naskahDiterima.tanggal,
          },
          pengirim: {
            position: pengirim.position,
            position_text: pengirim.position_text,
            organization_id: pengirim.organization_id,
            organization_text: pengirim.organization_text,
          },
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
          lampiran: lampiranResponses,
          final_pdf: finalPdfPath,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[SDE Forward] Error:', error);

      throw new HttpException(
        {
          statusCode: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || 'Gagal forward surat dinas eksternal',
          error: error.name,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
