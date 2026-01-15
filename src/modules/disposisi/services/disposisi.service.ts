import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, DataSource, In } from 'typeorm';
import { RelationSp } from '../../master-data/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from '../../master-data/relation_osc/entities/relation_osc.entity';
import { RelationOa } from '../../master-data/relation_oa/entities/relation_oa.entity';
import { Person } from '../../master-data/person/entities/person.entity';
import { OmPosition } from '../../master-data/position/entities/om-position.entity';
import { OmAreaSub } from '../../master-data/areasub/entities/om-areasub.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../../shared/entities/naskah_referensi.entity';
import { DiEntity } from '../entities/di.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { DisposisiRecipientResponseDto } from '../dto/disposisi-recipient-response.dto';
import { CreateDisposisiDto } from '../dto/create-disposisi.dto';
import {
  SendDisposisiResponseDto,
  DisposisiSirkulasiInfoDto,
} from '../dto/send-disposisi-response.dto';
import {
  GetSendMessageResponseDto,
  SentMessageItemDto,
} from '../dto/get-send-message-response.dto';
import {
  UpdateMessageStatusDto,
  UpdateMessageStatusResponseDto,
} from '../dto/update-message-status.dto';
import {
  UpdateDraftDisposisiDto,
  UpdateDraftDisposisiResponseDto,
} from '../dto/update-draft-disposisi.dto';
import {
  SendDraftDisposisiDto,
  SendDraftDisposisiResponseDto,
} from '../dto/send-draft-disposisi.dto';
import {
  ForwardDisposisiDto,
  ForwardDisposisiResponseDto,
} from '../dto/forward-disposisi.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { GeneratePdfDispoService } from '../../generate_pdf/services/generate_pdf_dispo.service';
import { StorageService } from '../../storage/services/storage.service';
import { UploadTemporaryLampiranResponseDto } from '../dto/upload-temporary-lampiran.dto';
import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

// Interface untuk data dari position_json (cached org data)
interface PositionData {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number; // 1 = managerial, 0 = staff
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

interface OrgDataPosition {
  position: number;
  position_text?: string;

  organization_id: number;
  organization_parent: number | null;

  level: number;
  chief: number;
  bod_tag?: string;

  divisi_id?: number | null;
  direktorat_id?: number | null;
  sub_area?: number | null;
  departType?: string | null;
  persnum_person?: number | null;
}

@Injectable()
export class DisposisiService {
  constructor(
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
    @InjectRepository(RelationSp)
    private readonly relationSpRepository: Repository<RelationSp>,
    @InjectRepository(RelationOsc)
    private readonly relationOscRepository: Repository<RelationOsc>,
    @InjectRepository(RelationOa)
    private readonly relationOaRepository: Repository<RelationOa>,
    @InjectRepository(OmPosition)
    private readonly positionRepository: Repository<OmPosition>,
    @InjectRepository(OmAreaSub)
    private readonly areaSubRepository: Repository<OmAreaSub>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahReferensiEntity)
    private readonly naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    @InjectRepository(DiEntity)
    private readonly diRepository: Repository<DiEntity>,
    @InjectRepository(NomorEntity)
    private readonly nomorRepository: Repository<NomorEntity>,
    @InjectRepository(NomorRequestEntity)
    private readonly nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private readonly nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly generatePdfDispoService: GeneratePdfDispoService,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // HELPER METHODS FOR POSITION CONVERSION
  // ============================================================

  /**
   * Convert position IDs ke nama jabatan
   * Digunakan untuk mengubah [70016743, 70016751] menjadi ["VP IT", "Manager HR"]
   * 
   * @param positionIds - Array of position IDs (string or number)
   * @param tanggal - Optional tanggal untuk lookup org data
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
      console.warn(`[convertPositionIdsToNames] Org data not found for ${tgl}`);
      return positionIds.map(id => String(id)); // Fallback to IDs as strings
    }

    const barisData: PositionData[] = orgData.position_json;
    const names: string[] = [];

    for (const posId of positionIds) {
      const numericId = typeof posId === 'string' ? parseInt(posId, 10) : posId;
      const position = barisData.find(p => p.position === numericId);
      
      if (position) {
        // Return position_text with organization_text
        const fullName = `${position.position_text} - ${position.organization_text}`;
        names.push(fullName);
      } else {
        // Fallback if position not found
        names.push(String(posId));
      }
    }

    return names;
  }

  // ============================================================
  // HELPER METHODS FOR NUMBERING
  // ============================================================

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
   * Helper: Generate nomor DI dengan integrasi ke nomor_request dan nomor_request_detail
   * Menggunakan format dari tabel jenis dan update counter di tabel nomor
   * Auto-insert ke nomor_request dan nomor_request_detail dengan status 'terpakai'
   * DI menggunakan position-based counter (sama seperti ND)
   * 
   * @param pengirim - Data pengirim dari org_data/position_json
   * @param perihal - Perihal disposisi
   * @param tanggal - Tanggal disposisi
   * @param queryRunner - Query runner untuk transaction
   * @returns Nomor disposisi yang sudah di-generate
   */
  private async generateNomorWithIntegration(
    pengirim: PositionData,
    perihal: string,
    tanggal: Date,
    queryRunner: any,
  ): Promise<string> {
    const jenis = 'DI';
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
      company: String(pengirim.company || COMPANY_ID),
      area: pengirim.area || null,
      subArea: String(pengirim.sub_area || ''),
      organization: String(pengirim.organization_id || ''),
      position: String(pengirim.position),
      tanggal: tanggal,
      jenis: jenis,
      klasifikasi: null, // DI tidak memiliki klasifikasi
      perihal: perihal,
      jumlah: 1,
      penandatangan: pengirim.persnum_person_text || null,
      idPositionPenandatangan: pengirim.position || null,
    });

    await queryRunner.manager.save(nomorRequest);

    // 3. Query nomor terakhir dengan locking (DI menggunakan Company + Position, seperti ND)
    const nomorRecord = await queryRunner.manager
      .createQueryBuilder(NomorEntity, 'n')
      .where('n.tahun = :tahun', { tahun })
      .andWhere('n.jenis = :jenis', { jenis })
      .andWhere('n.company = :company', { company: nomorRequest.company })
      .andWhere('n.position = :position', { position: nomorRequest.position })
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

    // Replace semua placeholder di format dengan nilai sebenarnya
    let nomorBaru = jenisData.formatPenomoran
      .replace(/{TIPE}/g, jenis)
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, '') // DI tidak ada klasifikasi
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
        tahun: tahun,
        jenis: jenis,
        nomor: noUrut,
      });
      await queryRunner.manager.save(nomor);
    }

    return nomorBaru;
  }

  // ============================================================
  // PDF GENERATION
  // ============================================================

  /**
   * Generate PDF dari HTML content untuk Disposisi
   * Menggunakan Puppeteer di backend untuk render HTML
   * Support temporary lampiran system dan field dinamis dari form
   * 
   * @param htmlContent - Konten catatan (HTML atau base64)
   * @param penerima - Array penerima/tertuju
   * @param disposisi - Array checkbox disposisi yang dipilih
   * @param sifat - Klasifikasi (Biasa, Terbatas, Rahasia, Sangat Rahasia)
   * @param pengirim - Nama pengirim
   * @param tembusan - Array tembusan
   * @param lampiranTempIds - ID lampiran temporary untuk di-merge
   * @param options - Additional options (refNomor, refPerihal, refTanggal, refPengirim, tanggalDisposisi, isFinal, catatan)
   */
  async generatePdfFromHtml(
    htmlContent: string,
    penerima: string[],
    disposisi: string[] = [],
    sifat: string = '',
    pengirim: string = '',
    tembusan: string[] = [],
    lampiranTempIds?: string[],
    options?: {
      refNomor?: string;
      refPerihal?: string;
      refTanggal?: string;
      refPengirim?: string;
      tanggalDisposisi?: string;
      isFinal?: boolean;
      catatan?: string;
    },
  ): Promise<Buffer> {
    try {
      const htmlBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64');
      
      // Format tanggal default jika tidak disediakan
      const tanggal = options?.tanggalDisposisi || new Date().toLocaleDateString('id-ID', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Auto-check "Lainnya" if catatan is filled
      let finalDisposisi = [...disposisi];
      if (options?.catatan && options.catatan.trim().length > 0 && !finalDisposisi.includes('Lainnya')) {
        finalDisposisi.push('Lainnya');
      }

      let pdfBuffer = await this.generatePdfDispoService.generatePdf({
        html: htmlBase64,
        penerima: penerima,
        disposisi: finalDisposisi,
        sifat: sifat || 'Biasa',
        pengirim: pengirim,
        tembusan: tembusan,
        perihal: options?.refPerihal || '',
        refNomor: options?.refNomor || '',
        refPerihal: options?.refPerihal || '',
        refTanggal: options?.refTanggal || '',
        refPengirim: options?.refPengirim || '',
        tanggal: tanggal,
        catatan: options?.catatan || '',
      });

      // If lampiran temp IDs provided, fetch and merge with main PDF
      if (lampiranTempIds && lampiranTempIds.length > 0) {
        const lampiranFiles = await this.getTemporaryLampiranFiles(lampiranTempIds);
        if (lampiranFiles && lampiranFiles.length > 0) {
          pdfBuffer = await this.mergePdfWithTemporaryFiles(
            pdfBuffer,
            lampiranFiles,
          );
        }
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
      console.error('[getTemporaryLampiranFiles] Error:', error);
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
            console.warn(
              `[mergePdfWithTemporaryFiles] Skipping non-PDF file: ${file.fileName}`,
            );
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

          console.log(
            `[mergePdfWithTemporaryFiles] Merged file: ${file.fileName}`,
          );
        } catch (error) {
          console.error(
            `[mergePdfWithTemporaryFiles] Error merging ${file.fileName}:`,
            error,
          );
        }
      }

      const mergedPdfBytes = await pdfDoc.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      console.error(`[mergePdfWithTemporaryFiles] Error:`, error);
      return mainPdfBuffer;
    }
  }

  /**
   * Upload lampiran ke temporary folder
   * Files akan disimpan dengan is_temporary=1 dan temp_folder_id yang sama
   */
  async uploadTemporaryLampiran(
    files: Express.Multer.File[],
  ): Promise<UploadTemporaryLampiranResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Tidak ada file yang diupload');
    }

    const tempFolderId = uuidv4();
    const uploadedFiles: {
      id: string;
      file_name: string;
      file_path: string;
      file_url: string;
    }[] = [];

    // Upload semua files ke temporary folder
    for (const file of files) {
      const uploadResult = await this.storageService.uploadFile(
        file,
        `temporary/${tempFolderId}`,
      );

      // Simpan ke database dengan is_temporary=1
      const lampiranEntity = this.naskahLampiranRepository.create({
        id: uuidv4(),
        id_naskah: null, // Belum ada naskah
        file_name: file.originalname,
        file_pdf: uploadResult.key,
        jenis: 'DI', // Disposisi
        is_temporary: 1,
        temp_folder_id: tempFolderId,
      });

      await this.naskahLampiranRepository.save(lampiranEntity);

      // Use backend preview endpoint (works reliably for inline preview)
      const fileUrl = `/preview-file/${lampiranEntity.id}`;

      uploadedFiles.push({
        id: lampiranEntity.id,
        file_name: lampiranEntity.file_name,
        file_path: lampiranEntity.file_pdf,
        file_url: fileUrl,
      });
    }

    return {
      success: true,
      data: {
        temp_folder_id: tempFolderId,
        files: uploadedFiles,
      },
    };
  }

  /**
   * Move temporary lampiran to final location
   * Called after Disposisi is sent/saved successfully
   */
  private async moveTemporaryLampiranToFinal(
    lampiranIds: string[],
    naskahId: string,
    jenis: 'DI' | 'ND' | 'SDI' | 'SDE' | 'KA',
    finalFolder: string,
  ): Promise<void> {
    if (!lampiranIds || lampiranIds.length === 0) {
      return;
    }

    // Get all temporary lampiran
    const tempLampiran = await this.naskahLampiranRepository.find({
      where: {
        id: In(lampiranIds),
        is_temporary: 1,
      },
    });

    if (tempLampiran.length === 0) {
      throw new NotFoundException('Lampiran temporary tidak ditemukan');
    }

    // Validate all lampiran are temporary
    if (tempLampiran.length !== lampiranIds.length) {
      throw new BadRequestException(
        'Beberapa lampiran ID tidak valid atau bukan temporary',
      );
    }

    // Move each file and update database
    for (const lampiran of tempLampiran) {
      const fileName = lampiran.file_name;
      const oldKey = lampiran.file_pdf;

      // Generate new key untuk final location
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const newKey = `${finalFolder}/${timestamp}-${sanitizedFileName}`;

      // Move file di storage
      await this.storageService.moveFile(oldKey, newKey);

      // Update database
      lampiran.id_naskah = naskahId;
      lampiran.file_pdf = newKey;
      lampiran.jenis = jenis;
      lampiran.is_temporary = 0;
      lampiran.temp_folder_id = null;

      await this.naskahLampiranRepository.save(lampiran);
    }
  }

  // ============================================================
  // ORG_DATA INTEGRATION METHODS
  // ============================================================

  /**
   * Get cached position_json from org_data
   */
  private async getPositionData(tgl?: string): Promise<PositionData[]> {
    const today = tgl || new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(today);
    return orgData.position_json as PositionData[];
  }

  /**
   * Find position data by position_id
   */
  private findByPosition(
    barisData: PositionData[],
    position: number,
  ): PositionData | undefined {
    return barisData.find((x) => Number(x.position) === Number(position));
  }

  /**
   * Filter recipients for Disposisi:
   * Rules: Managerial ke managerial/fungsional/staf di bawahnya (langsung/tidak langsung)
   * dalam Company yang sama sampai level kedalaman tertentu
   *
   * Barrier Depth berdasarkan level pengirim:
   * - EVP (Level 0) → bisa ke Level 1, 2, 3 (max depth = 3)
   * - VP (Level 1) → bisa ke Level 2, 3 (max depth = 2)
   * - Manager (Level 2) → bisa ke Level 3 (max depth = 1)
   * - Staff (Level 3) → tidak bisa kirim (bukan managerial)
   *
   * Logic:
   * 1. Calculate barrier depth based on sender level (3 - currentLevel)
   * 2. Get all organizations under current organization (recursive)
   * 3. Get all positions in those organizations (managerial + staff)
   * 4. Same company
   */

  /**
   * Get disposisi recipients using cached org_data
   * Returns all fields from position_json
   *
   * Barrier depth is automatically calculated based on sender level:
   * - Level 0 (EVP) → depth 3 (can reach level 1, 2, 3)
   * - Level 1 (VP) → depth 2 (can reach level 2, 3)
   * - Level 2 (Manager) → depth 1 (can reach level 3)
   * - Level 3 (Staff) → cannot send disposisi
   */

  private buildTreeIndex(
    data: OrgDataPosition[],
  ): Map<number, OrgDataPosition[]> {
    const map = new Map<number, OrgDataPosition[]>();

    for (const item of data) {
      const parentId = item.organization_parent ?? 0;
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId)!.push(item);
    }

    return map;
  }

  private isStaffAllowed(
    staff: OrgDataPosition,
    current: OrgDataPosition,
  ): boolean {
    if (staff.chief !== 0) return true;

    if (current.bod_tag === 'BOD-1') {
      return staff.divisi_id === current.divisi_id;
    }

    if (current.bod_tag === 'BOD') {
      return staff.direktorat_id === current.direktorat_id;
    }

    return true;
  }

  private getChildTreeWithSameLevelStaff(
    index: Map<number, OrgDataPosition[]>,
    allData: OrgDataPosition[],
    current: OrgDataPosition,
  ): OrgDataPosition[] {
    /* 1️⃣ SAME LEVEL STAFF */
    const sameLevelStaff = allData.filter(
      (x) =>
        x.chief === 0 &&
        x.persnum_person !== null &&
        x.position !== current.position &&
        this.isStaffAllowed(x, current),
    );

    /* 2️⃣ CHILD TREE */
    const visited = new Set<number>();

    const getChildren = (parentId: number): OrgDataPosition[] => {
      if (visited.has(parentId)) return [];
      visited.add(parentId);

      return (index.get(parentId) ?? []).flatMap((child) => {
        if (
          child.direktorat_id !== null &&
          !['BOD', 'BOD-1'].includes(child.bod_tag ?? '') &&
          child.direktorat_id !== current.direktorat_id
        )
          return [];
        if (!this.isStaffAllowed(child, current)) return [];
        return [child, ...getChildren(child.organization_id)];
      });
    };

    const childTree = getChildren(current.organization_id);
    // const childTree = [];
    const bod1: OrgDataPosition[] =
      current.bod_tag === 'BOD'
        ? allData.filter(
            (x) =>
              x.sub_area === current.sub_area &&
              x.chief === 1 &&
              x.direktorat_id !== current.direktorat_id &&
              x.bod_tag === 'BOD-1',
          )
        : [];

    /* 3️⃣ MERGE + DEDUP */
    const map = new Map<number, OrgDataPosition>();
    [...sameLevelStaff, ...childTree, ...bod1].forEach((x) =>
      map.set(x.position, x),
    );

    return this.sortOrgTree(
      Array.from(map.values()),
      current.direktorat_id ?? undefined,
    );
  }

  private sortOrgTree(
    data: OrgDataPosition[],
    currentDirektoratId?: number,
  ): OrgDataPosition[] {
    const bodOrder: Record<string, number> = {
      BOD: 0,
      'BOD-1': 1,
      'BOD-2': 2,
      'BOD-3': 3,
    };

    return data.sort((a, b) => {
      // 1️⃣ Chief dulu
      if (a.chief !== b.chief) {
        return b.chief - a.chief; // chief=1 di atas
      }

      // 1️⃣a Jika sama-sama chief, direktorat sama → lebih atas
      if (
        a.chief === 1 &&
        b.chief === 1 &&
        currentDirektoratId !== undefined &&
        a.bod_tag === 'BOD-1' &&
        b.bod_tag === 'BOD-1'
      ) {
        const aSameDir = a.direktorat_id === currentDirektoratId;
        const bSameDir = b.direktorat_id === currentDirektoratId;

        if (aSameDir !== bSameDir) {
          return aSameDir ? -1 : 1;
        }
      }

      // 2️⃣ BOD order
      const bodA = bodOrder[a.bod_tag ?? ''] ?? 99;
      const bodB = bodOrder[b.bod_tag ?? ''] ?? 99;

      if (bodA !== bodB) {
        return bodA - bodB;
      }

      // 3️⃣ Fallback biar konsisten
      return Number(a.position) - Number(b.position);
    });
  }

  private filterByPositionDispo(barisData, positionParam) {
    // cari item current
    const current = barisData.find(
      (x) => Number(x.position) === Number(positionParam),
    );
    if (!current) return [];

    const barisFilter = barisData.filter(
      (x) => x.area === current.area,
    );

    const currentLevel = Number(current.level);
    const bodTag = current.bod_tag;
    const bods = ['BOD', 'BOD-1'];
    const isBod = bodTag && bods.includes(bodTag);
    if (isBod) {
      const index = this.buildTreeIndex(barisFilter);
      const children = this.getChildTreeWithSameLevelStaff(
        index,
        barisFilter,
        current,
      );
      //general manager
      const gm =
        current.bod_tag === 'BOD'
          ? barisData.filter(
              (x) =>
                x.chief === 1 &&
                x.area !== current.area &&
                x.bod_tag === 'BOD-1',
            )
          : [];
      return [...children, ...gm];
    }
    const filtered = barisData.filter(
      (x) =>
        x.level === currentLevel + 1 &&
        x.area === current.area &&
        x.organization_parent === current.organization_id &&
        x.chief === 1,
    );

    // get staff
    const staffFilter = barisData.filter(
      (x) =>
        x.chief === 0 &&
        x.persnum_person !== null &&
        Number(x.divisi_id) === Number(current.divisi_id) &&
        x.sub_area === current.sub_area &&
        x.divisi_id != null,
    );

    return [...filtered, ...staffFilter];
  }

  async getDisposisiRecipients(
    positionId: number,
  ): Promise<DisposisiRecipientResponseDto> {
    // Get cached position data
    const barisData = await this.getPositionData();

    // Find sender data
    const senderData = this.findByPosition(barisData, positionId);

    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    // Check if position is managerial (chief = 1)
    if (senderData.chief !== 1) {
      throw new ForbiddenException(
        `Hanya managerial yang bisa kirim Disposisi. Position ${positionId} bukan managerial.`,
      );
    }

    // Calculate barrier depth for this sender
    const senderLevel = Number(senderData.level);
    const barrierDepth = 3 - senderLevel;
    /*
    // Check if sender can send disposisi (must have barrier depth > 0)
    if (barrierDepth <= 0) {
      throw new ForbiddenException(
        `Position level ${senderLevel} tidak bisa mengirim Disposisi. Hanya level 0-2 yang bisa mengirim.`,
      );
    }*/

    // Get recipients using filter logic - barrier depth based on sender level
    const recipientData = this.filterByPositionDispo(barisData, positionId);

    // Filter: exclude self
    const recipients = recipientData.filter((r) => r.position !== positionId);

    const totalRecipients = recipients.length;
    const uniqueOrgIds = new Set(recipients.map((r) => r.organization_id));

    return {
      sender: senderData,
      recipients: {
        ATASAN: [], // DI: no ATASAN
        BAWAHAN: recipients, // DI: managerial/fungsional/staf di bawahnya
        REKAN: [], // DI: no REKAN
      },
      hierarchy: {
        maxDepth: barrierDepth,
        totalOrganizations: uniqueOrgIds.size,
        totalRecipients,
      },
    };
  }

  // ============================================================
  // HELPER - VALIDATE RECIPIENTS
  // ============================================================

  /**
   * Validate that all penerima_position_ids are valid recipients
   * based on filterByPositionDispo (only bawahan allowed)
   *
   * @throws ForbiddenException if any penerima is not a valid recipient
   */
  private validateRecipients(
    barisData: PositionData[],
    pengirimPositionId: number,
    penerimaPositionIds: number[],
  ): void {
    // Get valid recipients for this sender
    const validRecipients = this.filterByPositionDispo(
      barisData,
      pengirimPositionId,
    );
    const validPositionIds = new Set(
      validRecipients.map((r) => Number(r.position)),
    );

    // Check each penerima
    const invalidRecipients: number[] = [];
    for (const penerimaId of penerimaPositionIds) {
      if (!validPositionIds.has(Number(penerimaId))) {
        invalidRecipients.push(penerimaId);
      }
    }

    if (invalidRecipients.length > 0) {
      throw new ForbiddenException(
        `Penerima dengan position_id [${invalidRecipients.join(', ')}] tidak valid. ` +
          `Disposisi hanya bisa dikirim ke bawahan langsung/tidak langsung dalam struktur organisasi yang sama.`,
      );
    }
  }

  // ============================================================
  // SEND MESSAGE METHODS
  // ============================================================

  /**
   * Check if a position is managerial by checking if it exists in om_relation_osc
   * Position in om_relation_osc = Managerial
   */
  async checkIsManagerial(position: number): Promise<boolean> {
    const oscRecord = await this.relationOscRepository.findOne({
      where: {
        relation_position: position,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    return !!oscRecord;
  }

  /**
   * Get complete user info for sirkulasi (position, organization, area, sub_area, name)
   */
  async getUserCompleteInfo(persnum: number): Promise<{
    persnum: number;
    nama: string;
    position: number;
    positionText: string;
    organization: number;
    organizationText: string;
    company: number;
    area: string;
    areaText: string;
    subArea: number;
    subAreaText: string;
  } | null> {
    try {
      // Get person
      const person = await this.personRepository.findOne({
        where: { persnum },
      });
      if (!person) return null;

      // Get position from om_relation_sp
      const relationSp = await this.relationSpRepository.findOne({
        where: {
          relation_persnum: persnum,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!relationSp || !relationSp.position) return null;

      // Get organization from om_relation_osc
      const relationOsc = await this.relationOscRepository.findOne({
        where: {
          relation_position: relationSp.position,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!relationOsc || !relationOsc.organization) return null;

      // Get sub_area from om_relation_oa
      const relationOa = await this.relationOaRepository.findOne({
        where: {
          organization: relationOsc.organization,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!relationOa || !relationOa.relation_sub_area) return null;

      // Get area from om_area_sub
      const areaSub = await this.areaSubRepository.findOne({
        where: {
          sub_area: relationOa.relation_sub_area,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!areaSub || !areaSub.area) return null;

      // Get position text
      const positionEntity = await this.positionRepository.findOne({
        where: { position: relationSp.position },
      });

      return {
        persnum: person.persnum!,
        nama: person.name || '',
        position: relationSp.position,
        positionText: positionEntity?.shortText || '',
        organization: relationOsc.organization,
        organizationText: relationOsc.organization_text || '',
        company: COMPANY_ID,
        area: areaSub.area,
        areaText: areaSub.shortText || '',
        subArea: relationOa.relation_sub_area,
        subAreaText: areaSub.shortText || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Convert PositionData to DisposisiSirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: PositionData): DisposisiSirkulasiInfoDto {
    return {
      position_id: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum_person,
      nama: pos.persnum_person_text,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
      company: pos.company || COMPANY_ID,
      company_name: pos.company_name,
    };
  }

  /**
   * Main method: Send Disposisi
   *
   * Alur penyimpanan sesuai relasi tabel:
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ TABEL NASKAH                                                        │
   * │ - id: UUID                                                          │
   * │ - jenis: 'DI'                                                       │
   * │ - klasifikasi: NULL (tidak dipakai untuk DI)                        │
   * │ - klasifikasi_text: NULL (tidak dipakai untuk DI)                   │
   * │ - sifat: dari dto.sifat                                             │
   * │ - nomor: dari dto.ref_nomor_surat                                   │
   * │ - tanggal: dari dto.tanggal_disposisi                               │
   * │ - perihal: dari dto.ref_perihal_surat                               │
   * │ - konten: JSON petunjuk disposisi yang dipilih                      │
   * │ - lampiran: jumlah file (e.g. "3 file")                             │
   * │ - status: 'draf' atau 'final'                                       │
   * ├─────────────────────────────────────────────────────────────────────┤
   * │ TABEL NASKAH_SIRKULASI (per pengirim & penerima)                    │
   * │ - id_naskah: FK ke naskah.id                                        │
   * │ - sirkuler: 'pengirim' / 'penerima'                                 │
   * │ - company, area, sub_area, organization, position + text            │
   * │ - position_status: 'ybs'                                            │
   * │ - id_sirkuler: persnum                                              │
   * │ - nama_sirkuler: nama orang                                         │
   * ├─────────────────────────────────────────────────────────────────────┤
   * │ TABEL NASKAH_LAMPIRAN (per file)                                    │
   * │ - id_naskah: FK ke naskah.id                                        │
   * │ - file_name: nama file                                              │
   * │ - file_pdf: URL file                                                │
   * │ - jenis: 'DI'                                                       │
   * └─────────────────────────────────────────────────────────────────────┘
   */
  async sendMessage(
    dto: CreateDisposisiDto,
  ): Promise<SendDisposisiResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get cached position data
      const barisData = await this.getPositionData();

      // PHASE 1: Validate pengirim (must be managerial)
      const pengirimData = this.findByPosition(
        barisData,
        dto.pengirim_position_id,
      );
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      // Check if pengirim is managerial (chief = 1)
      if (pengirimData.chief !== 1) {
        throw new ForbiddenException(
          `Hanya managerial yang bisa kirim Disposisi. Position ${dto.pengirim_position_id} bukan managerial.`,
        );
      }

      // Check barrier depth (level 0-2 can send, level 3+ cannot)
      // DISABLED: Validation handled by frontend
      const senderLevel = Number(pengirimData.level);
      const barrierDepth = 3 - senderLevel;
      /*
      if (barrierDepth <= 0) {
        throw new ForbiddenException(
          `Position level ${senderLevel} tidak bisa mengirim Disposisi. Hanya level 0-2 yang bisa mengirim.`,
        );
      }
      */

      // PHASE 2: Validate all penerima
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima_position_ids) {
        const penerimaData = this.findByPosition(barisData, penerimaPositionId);
        if (!penerimaData) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaData);
      }

      // Validate recipients: hanya bawahan yang valid (dari get-recipient)
      this.validateRecipients(
        barisData,
        dto.pengirim_position_id,
        dto.penerima_position_ids,
      );

      // PHASE 3: Auto-generate nomor surat dengan integrated numbering
      const naskahId = uuidv4();
      const tanggalDisposisi = new Date(dto.tanggal_disposisi);

      // Generate nomor surat otomatis dengan integrasi ke nomor_request
      const generatedNomor = await this.generateNomorWithIntegration(
        pengirimData,
        dto.perihal,
        tanggalDisposisi,
        queryRunner
      );

      // Insert ke tabel NASKAH
      // nomor: auto-generated dengan integrasi
      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'DI',
        // klasifikasi & klasifikasi_text = NULL untuk DI (tidak ada di form)
        sifat: dto.sifat,
        nomor: generatedNomor, // Nomor otomatis ter-generate dengan integrasi
        tanggal: tanggalDisposisi,
        perihal: dto.perihal, // Perihal masuk ke tabel naskah
        konten: dto.disposisi || undefined, // Simpan disposisi ke kolom konten juga
        status: 'final',
        lampiran: dto.lampiran?.length
          ? `${dto.lampiran.length} file`
          : undefined,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 4: Insert ke tabel NASKAH_REFERENSI (HANYA jika disposisi lanjutan)
      // Disposisi pertama: TIDAK insert ke naskah_referensi
      // Disposisi lanjutan: Insert dengan referensi ke naskah yang diterima sebelumnya
      if (dto.id_naskah_sebelumnya) {
        // Ambil data naskah sebelumnya untuk referensi
        const naskahSebelumnya = await this.naskahRepository.findOne({
          where: { id: dto.id_naskah_sebelumnya },
        });

        if (naskahSebelumnya) {
          const naskahReferensi = new NaskahReferensiEntity();
          naskahReferensi.id = uuidv4();
          naskahReferensi.id_naskah = naskahId;
          naskahReferensi.ref_jenis = naskahSebelumnya.jenis || 'DI';
          naskahReferensi.ref_pengirim = null; // Bisa diisi dari sirkulasi pengirim sebelumnya jika perlu
          naskahReferensi.ref_tanggal = naskahSebelumnya.tanggal || null;
          naskahReferensi.ref_nomor = naskahSebelumnya.nomor || null; // ref_nomor dari naskah sebelumnya
          naskahReferensi.ref_perihal = naskahSebelumnya.perihal || null;
          await queryRunner.manager.save(naskahReferensi);
        }
      }
      // Jika disposisi pertama (tanpa id_naskah_sebelumnya), TIDAK ada insert ke naskah_referensi

      // PHASE 5: Insert ke tabel NASKAH_SIRKULASI - pengirim
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirimData.company || COMPANY_ID),
        companyText: pengirimData.company_name || 'PERUM LPPNPI',
        area: pengirimData.area || '',
        areaText: pengirimData.area_text || '',
        subArea: pengirimData.sub_area ? String(pengirimData.sub_area) : '',
        subAreaText: pengirimData.sub_area_text || '',
        organization: String(pengirimData.organization_id),
        organizationText: pengirimData.organization_text,
        position: String(pengirimData.position),
        positionText: pengirimData.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirimData.persnum_person
          ? String(pengirimData.persnum_person)
          : '',
        namaSirkuler: pengirimData.persnum_person_text || '',
        isDraft: false, // sendMessage = bukan draft
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 6: Insert ke tabel NASKAH_SIRKULASI - penerima (per recipient)
      const penerimaResponses: DisposisiSirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaDataList.length; i++) {
        const penerima = penerimaDataList[i];
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: penerima.company_name || 'PERUM LPPNPI',
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
          isDraft: false, // sendMessage = bukan draft
          urutan: i, // urutan sesuai input form
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 6: Insert ke tabel NASKAH_LAMPIRAN (per file)
      const lampiranResponses: Array<{
        id: string;
        nama_file: string;
        url: string;
        tipe?: string;
      }> = [];

      // Handle temporary lampiran (RECOMMENDED)
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'DI',
          'disposisi/lampiran',
        );

        // Fetch moved lampiran untuk response
        const movedLampiran = await this.naskahLampiranRepository.find({
          where: { id_naskah: naskahId },
        });

        for (const lamp of movedLampiran) {
          lampiranResponses.push({
            id: lamp.id,
            nama_file: lamp.file_name,
            url: lamp.file_pdf,
          });
        }
      }
      // Legacy: Direct lampiran upload (deprecated)
      else if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'DI',
          });
          await queryRunner.manager.save(lampiran);

          lampiranResponses.push({
            id: lampiranId,
            nama_file: lamp.nama_file,
            url: lamp.url,
            tipe: lamp.tipe,
          });
        }
      }

      // PHASE 7: Insert ke tabel DI (konten lengkap lembar disposisi)
      // Build kepada_yth dari penerima
      const kepadaYthList = penerimaDataList.map(
        (p) => `${p.position_text} ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const diEntity = this.diRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? null,
        kopJudul: dto.kop_judul ?? 'LEMBAR DISPOSISI',
        namaJabatan: dto.nama_jabatan ?? pengirimData.position_text,
        nomorAgenda: dto.nomor_agenda ?? null,
        tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
        suratDari: dto.surat_dari ?? null,
        tanggal: tanggalDisposisi,
        nomor: generatedNomor, // Nomor otomatis dari integrasi
        perihal: dto.perihal,
        klasifikasi: dto.klasifikasi ?? null,
        kepadaYth: kepadaYth,
        disposisi: dto.disposisi ?? null, // Langsung dari FE (checkbox yang diformat)
        catatan: dto.catatan ?? null, // Untuk checkbox "Lainnya"
        paraf: dto.paraf ?? null,
      });
      await queryRunner.manager.save(diEntity);

      // PHASE 8: Auto-generate PDF with lampiran (for sendMessage, status is always 'final')
      let finalPdfPath: string | undefined = undefined;
      try {
        // Parse disposisi string to array (format: "Untuk Diketahui\nProses Lanjut\nKoordinasikan")
        // Split by newline to get individual checkbox items
        let disposisiArray: string[] = [];
        if (dto.disposisi) {
          if (Array.isArray(dto.disposisi)) {
            disposisiArray = dto.disposisi;
          } else if (typeof dto.disposisi === 'string') {
            // Split by newline and filter empty strings
            disposisiArray = dto.disposisi.split('\n').map(s => s.trim()).filter(s => s.length > 0);
          }
        }
        
        // Auto-check "Lainnya" if catatan is filled
        if (dto.catatan && dto.catatan.trim().length > 0 && !disposisiArray.includes('Lainnya')) {
          disposisiArray.push('Lainnya');
        }
        console.log('[DI sendMessage] disposisiArray:', disposisiArray);

        // Get reference data from naskah sebelumnya (if exists)
        let refNomor = '';
        let refPerihal = '';
        let refTanggal = '';
        let refPengirim = '';
        
        if (dto.id_naskah_sebelumnya) {
          const naskahRef = await this.naskahRepository.findOne({
            where: { id: dto.id_naskah_sebelumnya },
          });
          if (naskahRef) {
            refNomor = naskahRef.nomor || '';
            refPerihal = naskahRef.perihal || '';
            refPengirim = ''; // Can be filled from sirkulasi pengirim if needed
            if (naskahRef.tanggal) {
              const refDate = new Date(naskahRef.tanggal);
              refTanggal = refDate.toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
            }
          }
        }

        // Generate PDF with all data
        let pdfBuffer = await this.generatePdfDispoService.generatePdf({
          html: '',
          penerima: kepadaYthList,
          disposisi: disposisiArray, // Now properly parsed as array
          sifat: dto.sifat || 'Biasa',
          pengirim: `${pengirimData.position_text} ${pengirimData.organization_text}`,
          tembusan: [],
          perihal: dto.perihal,
          refNomor: refNomor,
          refPerihal: refPerihal,
          refTanggal: refTanggal,
          refPengirim: refPengirim,
          tanggal: tanggalDisposisi.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          catatan: dto.catatan || '',
        });

        // Merge with lampiran if any
        if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
          const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
            console.log('[DI sendMessage] Merged with', lampiranFiles.length, 'lampiran files');
          }
        }

        // Upload PDF to storage with organized folder structure
        const timestamp = Date.now();
        const pdfFileName = `DI-${generatedNomor.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'disposisi/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        console.log('[DI sendMessage] PDF auto-generated:', finalPdfPath);
      } catch (error) {
        console.error('[DI sendMessage] Failed to auto-generate PDF:', error);
        // Don't fail the whole transaction if PDF generation fails
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: 'Disposisi berhasil dikirim',
        data: {
          id: naskahId,
          jenis: 'DI',
          nomor: generatedNomor, // Nomor dari integrasi
          tanggal: dto.tanggal_disposisi,
          status: 'final',
          sifat: dto.sifat,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          disposisi: dto.disposisi,
          catatan: dto.catatan,
          lampiran:
            lampiranResponses.length > 0 ? lampiranResponses : undefined,
          id_naskah_sebelumnya: dto.id_naskah_sebelumnya || null,
          final_pdf: finalPdfPath, // Include generated PDF path in response
        },
      };
    } catch (error) {
      // Rollback on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Save Draft - Menyimpan Disposisi sebagai draft
   *
   * Method ini memiliki logic yang sama dengan sendMessage,
   * tetapi dengan status 'draf' sebagai default dan
   * tidak ada validasi managerial/level.
   *
   * @param dto - CreateDisposisiDto
   * @returns Promise<SendDisposisiResponseDto>
   */
  async saveDraft(dto: CreateDisposisiDto): Promise<SendDisposisiResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get cached position data
      const barisData = await this.getPositionData();

      // PHASE 1: Validate pengirim (no managerial check for draft)
      const pengirimData = this.findByPosition(
        barisData,
        dto.pengirim_position_id,
      );
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      // PHASE 2: Validate all penerima
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima_position_ids) {
        const penerimaData = this.findByPosition(barisData, penerimaPositionId);
        if (!penerimaData) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaData);
      }

      // Validate recipients: hanya bawahan yang valid (dari get-recipient)
      this.validateRecipients(
        barisData,
        dto.pengirim_position_id,
        dto.penerima_position_ids,
      );

      // PHASE 3: Insert naskah with status 'draf'
      const naskahId = uuidv4();
      const tanggalDisposisi = new Date(dto.tanggal_disposisi);

      // Insert ke tabel NASKAH with status 'draf'
      // perihal dari dto.perihal (bukan ref_perihal_surat)
      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'DI',
        sifat: dto.sifat,
        nomor: dto.ref_nomor_surat || undefined, // Opsional untuk disposisi pertama
        tanggal: tanggalDisposisi,
        perihal: dto.perihal, // Perihal masuk ke tabel naskah
        konten: dto.disposisi || undefined, // Simpan disposisi ke kolom konten juga
        status: 'draf',
        lampiran: dto.lampiran?.length
          ? `${dto.lampiran.length} file`
          : undefined,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 4: Insert ke tabel NASKAH_REFERENSI (HANYA jika disposisi lanjutan)
      // Disposisi pertama: TIDAK insert ke naskah_referensi
      // Disposisi lanjutan: Insert dengan referensi ke naskah yang diterima sebelumnya
      if (dto.id_naskah_sebelumnya) {
        // Ambil data naskah sebelumnya untuk referensi
        const naskahSebelumnya = await this.naskahRepository.findOne({
          where: { id: dto.id_naskah_sebelumnya },
        });

        if (naskahSebelumnya) {
          const naskahReferensi = new NaskahReferensiEntity();
          naskahReferensi.id = uuidv4();
          naskahReferensi.id_naskah = naskahId;
          naskahReferensi.ref_jenis = naskahSebelumnya.jenis || 'DI';
          naskahReferensi.ref_pengirim = null;
          naskahReferensi.ref_tanggal = naskahSebelumnya.tanggal || null;
          naskahReferensi.ref_nomor = naskahSebelumnya.nomor || null;
          naskahReferensi.ref_perihal = naskahSebelumnya.perihal || null;
          await queryRunner.manager.save(naskahReferensi);
        }
      }
      // Jika disposisi pertama (tanpa id_naskah_sebelumnya), TIDAK ada insert ke naskah_referensi

      // PHASE 5: Insert ke tabel NASKAH_SIRKULASI - pengirim (dengan isDraft = true)
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirimData.company || COMPANY_ID),
        companyText: pengirimData.company_name || 'PERUM LPPNPI',
        area: pengirimData.area || '',
        areaText: pengirimData.area_text || '',
        subArea: pengirimData.sub_area ? String(pengirimData.sub_area) : '',
        subAreaText: pengirimData.sub_area_text || '',
        organization: String(pengirimData.organization_id),
        organizationText: pengirimData.organization_text,
        position: String(pengirimData.position),
        positionText: pengirimData.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirimData.persnum_person
          ? String(pengirimData.persnum_person)
          : '',
        namaSirkuler: pengirimData.persnum_person_text || '',
        isDraft: true, // saveDraft = draft
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 6: Insert ke tabel NASKAH_SIRKULASI - penerima (dengan isDraft = true)
      const penerimaResponses: DisposisiSirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaDataList.length; i++) {
        const penerima = penerimaDataList[i];
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: penerima.company_name || 'PERUM LPPNPI',
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
          isDraft: true, // saveDraft = draft
          urutan: i, // urutan sesuai input form
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 7: Insert ke tabel NASKAH_LAMPIRAN
      const lampiranResponses: Array<{
        id: string;
        nama_file: string;
        url: string;
        tipe?: string;
      }> = [];

      // Handle temporary lampiran (RECOMMENDED)
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'DI',
          'disposisi/lampiran',
        );

        // Fetch moved lampiran untuk response
        const movedLampiran = await this.naskahLampiranRepository.find({
          where: { id_naskah: naskahId },
        });

        for (const lamp of movedLampiran) {
          lampiranResponses.push({
            id: lamp.id,
            nama_file: lamp.file_name,
            url: lamp.file_pdf,
          });
        }
      }
      // Legacy: Direct lampiran upload (deprecated)
      else if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'DI',
          });
          await queryRunner.manager.save(lampiran);

          lampiranResponses.push({
            id: lampiranId,
            nama_file: lamp.nama_file,
            url: lamp.url,
            tipe: lamp.tipe,
          });
        }
      }

      // PHASE 8: Insert ke tabel DI (konten lengkap lembar disposisi)
      // Build kepada_yth dari penerima
      const kepadaYthList = penerimaDataList.map(
        (p) => `${p.position_text} ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const diEntity = this.diRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? null,
        kopJudul: dto.kop_judul ?? 'LEMBAR DISPOSISI',
        namaJabatan: dto.nama_jabatan ?? pengirimData.position_text,
        nomorAgenda: dto.nomor_agenda ?? null,
        tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
        suratDari: dto.surat_dari ?? null,
        tanggal: tanggalDisposisi,
        nomor: dto.ref_nomor_surat ?? null,
        perihal: dto.perihal,
        klasifikasi: dto.klasifikasi ?? null,
        kepadaYth: kepadaYth,
        disposisi: dto.disposisi ?? null, // Langsung dari FE (checkbox yang diformat)
        catatan: dto.catatan ?? null, // Untuk checkbox "Lainnya"
        paraf: dto.paraf ?? null,
      });
      await queryRunner.manager.save(diEntity);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: 'Disposisi berhasil disimpan sebagai draft',
        data: {
          id: naskahId,
          jenis: 'DI',
          nomor: dto.ref_nomor_surat || null, // Samakan dengan Nota Dinas
          tanggal: dto.tanggal_disposisi,
          status: 'draf',
          sifat: dto.sifat,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          disposisi: dto.disposisi,
          catatan: dto.catatan,
          lampiran:
            lampiranResponses.length > 0 ? lampiranResponses : undefined,
          id_naskah_sebelumnya: dto.id_naskah_sebelumnya || null,
        },
      };
    } catch (error) {
      // Rollback on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get Send Message - Mendapatkan semua pesan DI yang sudah dikirimkan oleh user
   *
   * @param positionId - Position ID pengirim
   * @returns GetSendMessageResponseDto
   *
   * Query:
   * 1. Cari di naskah_sirkulasi dimana sirkuler='pengirim' dan position=positionId
   * 2. Join ke naskah untuk dapat detail naskah
   * 3. Join ke naskah_sirkulasi lagi untuk dapat penerima (sirkuler='penerima')
   * 4. Join ke naskah_lampiran untuk hitung jumlah lampiran
   */
  async getSendMessage(positionId: number): Promise<GetSendMessageResponseDto> {
    // Validate position exists
    const barisData = await this.getPositionData();
    const senderData = this.findByPosition(barisData, positionId);
    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    // Query naskah yang dikirim oleh position ini
    // Step 1: Get all naskah IDs where this position is pengirim
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.find({
      where: {
        position: String(positionId),
        sirkuler: 'pengirim',
      },
    });

    if (pengirimSirkulasi.length === 0) {
      return {
        success: true,
        message: 'Tidak ada pesan yang dikirim',
        total: 0,
        data: [],
      };
    }

    // Get naskah IDs
    const naskahIds = pengirimSirkulasi
      .map((s) => s.idNaskah)
      .filter((id) => id !== null);

    // Step 2: Get naskah details for DI type only
    const naskahList = await this.naskahRepository
      .createQueryBuilder('n')
      .where('n.id IN (:...ids)', { ids: naskahIds })
      .andWhere('n.jenis = :jenis', { jenis: 'DI' })
      .orderBy('n.tanggal', 'DESC')
      .getMany();

    if (naskahList.length === 0) {
      return {
        success: true,
        message: 'Tidak ada pesan Disposisi yang dikirim',
        total: 0,
        data: [],
      };
    }

    // Step 3: Build response data
    const result: SentMessageItemDto[] = [];

    for (const naskah of naskahList) {
      // Get pengirim info
      const pengirimInfo = pengirimSirkulasi.find(
        (s) => s.idNaskah === naskah.id,
      );

      // Get penerima list
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
        order: { urutan: 'ASC', createdAt: 'ASC' },
      });

      // Get lampiran count
      const lampiranCount = await this.naskahLampiranRepository.count({
        where: {
          id_naskah: naskah.id,
        },
      });

      // Parse petunjuk_disposisi from konten
      let petunjukDisposisi: any[] = [];
      if (naskah.konten) {
        try {
          petunjukDisposisi = JSON.parse(naskah.konten);
        } catch {
          petunjukDisposisi = [];
        }
      }

      // Build pengirim info
      const pengirim = {
        position_id: pengirimInfo?.position || '',
        position_text: pengirimInfo?.positionText || '',
        organization_text: pengirimInfo?.organizationText || '',
        nama: pengirimInfo?.namaSirkuler || null,
      };

      // Build penerima list
      const penerima = penerimaList.map((p) => ({
        position_id: p.position || '',
        position_text: p.positionText || '',
        organization_text: p.organizationText || '',
        nama: p.namaSirkuler || null,
      }));

      result.push({
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor, // ref_nomor_surat
        perihal: naskah.perihal, // ref_perihal_surat
        tanggal: naskah.tanggal,
        sifat: naskah.sifat,
        status: naskah.status,
        pengirim,
        penerima,
        petunjuk_disposisi:
          petunjukDisposisi.length > 0 ? petunjukDisposisi : undefined,
        jumlah_lampiran: lampiranCount,
      });
    }

    return {
      success: true,
      message: 'Berhasil mendapatkan daftar pesan yang dikirim',
      total: result.length,
      data: result,
    };
  }

  /**
   * Update Message Status - Update status pesan menjadi terbaca
   *
   * Kondisi: Ketika user berhasil mengirimkan pesan namun penerima belum membaca
   *
   * Deskripsi: Untuk update status pesan menjadi terbaca atau tidak.
   * - Default nota saat dikirimkan adalah tidak (send_read_time = NULL)
   * - Jika penerima membuka pesan maka otomatis status sudah terupdate
   *
   * Update field di naskah_sirkulasi:
   * - send_read_time: waktu baca
   * - send_read_user: user yang membaca
   *
   * @param dto - UpdateMessageStatusDto
   * @returns UpdateMessageStatusResponseDto
   */
  async updateMessageStatus(
    dto: UpdateMessageStatusDto,
  ): Promise<UpdateMessageStatusResponseDto> {
    // Find sirkulasi record for this naskah + position (penerima)
    const sirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: dto.id_naskah,
        position: dto.position_id,
        sirkuler: 'penerima',
      },
    });

    if (!sirkulasi) {
      throw new NotFoundException(
        `Pesan dengan id_naskah ${dto.id_naskah} untuk position ${dto.position_id} tidak ditemukan`,
      );
    }

    // Check if already read
    if (sirkulasi.sendReadTime) {
      return {
        success: true,
        message: 'Pesan sudah terbaca sebelumnya',
        data: {
          id_naskah: dto.id_naskah,
          position_id: dto.position_id,
          status_baca: 'terbaca',
          read_time: sirkulasi.sendReadTime,
          read_user: sirkulasi.sendReadUser,
        },
      };
    }

    // Update status to read
    const now = new Date();
    sirkulasi.sendReadTime = now;
    sirkulasi.sendReadUser = dto.user_id || dto.position_id;

    await this.naskahSirkulasiRepository.save(sirkulasi);

    return {
      success: true,
      message: 'Status pesan berhasil diupdate menjadi terbaca',
      data: {
        id_naskah: dto.id_naskah,
        position_id: dto.position_id,
        status_baca: 'terbaca',
        read_time: now,
        read_user: sirkulasi.sendReadUser,
      },
    };
  }

  // ============================================================
  // UPDATE DRAFT DISPOSISI
  // ============================================================

  /**
   * Update disposisi yang masih berstatus draft
   *
   * Flow:
   * 1. Validasi naskah exists dan status = 'draf'
   * 2. Validasi pengirim adalah owner dari naskah
   * 3. Update naskah (tanggal, sifat, konten/petunjuk)
   * 4. Update naskah_referensi (ref_nomor, ref_perihal)
   * 5. Update naskah_sirkulasi penerima (hapus lama, insert baru)
   * 6. Update naskah_lampiran (hapus lama, insert baru)
   * 7. Jika action = 'kirim', ubah status jadi 'final'
   *
   * @param naskahId - ID Naskah dari path parameter
   * @param dto - UpdateDraftDisposisiDto
   */
  async updateDraft(
    naskahId: string,
    dto: UpdateDraftDisposisiDto,
  ): Promise<UpdateDraftDisposisiResponseDto> {
    // PHASE 1: Validasi naskah exists dan status draft
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(
        `Naskah tidak bisa diupdate karena status sudah '${naskah.status}'. Hanya naskah dengan status 'draf' yang bisa diupdate.`,
      );
    }

    if (naskah.jenis !== 'DI') {
      throw new ForbiddenException(
        `Naskah ini bukan disposisi (jenis: ${naskah.jenis}). API ini hanya untuk update disposisi.`,
      );
    }

    // PHASE 2: Validasi pengirim adalah owner naskah
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        sirkuler: 'pengirim',
      },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(
        `Data pengirim tidak ditemukan untuk naskah ${naskahId}`,
      );
    }

    if (
      String(pengirimSirkulasi.position) !== String(dto.pengirim_position_id)
    ) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk mengupdate naskah ini. Hanya pengirim asli yang bisa mengupdate.`,
      );
    }

    // Get org data untuk validasi penerima baru dan mendapatkan positionAbbreviation
    const barisData = await this.getPositionData();

    // Get pengirim data untuk position_abbreviation
    const pengirimData = barisData.find(
      (item) => String(item.position) === String(dto.pengirim_position_id),
    );

    // Determine if this is a draft or final
    const isDraft = dto.action !== 'kirim';

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 3: Update tabel naskah

      if (dto.tanggal_disposisi) {
        naskah.tanggal = new Date(dto.tanggal_disposisi);
      }
      if (dto.sifat) {
        naskah.sifat = dto.sifat;
      }
      if (dto.disposisi) {
        naskah.konten = dto.disposisi; // Simpan disposisi ke kolom konten
      }
      if (dto.lampiran) {
        naskah.lampiran =
          dto.lampiran.length > 0 ? `${dto.lampiran.length} file` : '';
      }
      if (dto.perihal) {
        naskah.perihal = dto.perihal; // Perihal masuk ke naskah
      }

      // Auto-generate nomor surat saat sendDraft (action='kirim')
      if (!isDraft) {
        // Generate nomor otomatis saat kirim dengan integrated numbering
        if (pengirimData) {
          const generatedNomor = await this.generateNomorWithIntegration(
            pengirimData,
            naskah.perihal || '',
            naskah.tanggal || new Date(),
            queryRunner
          );
          naskah.nomor = generatedNomor;
        }
      } else if (dto.ref_nomor_surat) {
        // Untuk draft, gunakan nomor yang diberikan (jika ada)
        naskah.nomor = dto.ref_nomor_surat;
      }
      naskah.status = isDraft ? 'draf' : 'final';

      await queryRunner.manager.save(naskah);

      // PHASE 4: Update naskah_referensi (HANYA jika ada id_naskah_sebelumnya baru)
      // Jika user menambahkan referensi ke naskah sebelumnya
      if (dto.id_naskah_sebelumnya) {
        // Cek apakah sudah ada referensi
        const existingRef = await this.naskahReferensiRepository.findOne({
          where: { id_naskah: naskahId },
        });

        if (!existingRef) {
          // Insert referensi baru
          const naskahSebelumnya = await this.naskahRepository.findOne({
            where: { id: dto.id_naskah_sebelumnya },
          });

          if (naskahSebelumnya) {
            const naskahReferensi = new NaskahReferensiEntity();
            naskahReferensi.id = uuidv4();
            naskahReferensi.id_naskah = naskahId;
            naskahReferensi.ref_jenis = naskahSebelumnya.jenis || 'DI';
            naskahReferensi.ref_pengirim = null;
            naskahReferensi.ref_tanggal = naskahSebelumnya.tanggal || null;
            naskahReferensi.ref_nomor = naskahSebelumnya.nomor || null;
            naskahReferensi.ref_perihal = naskahSebelumnya.perihal || null;
            await queryRunner.manager.save(naskahReferensi);
          }
        }
      }

      // PHASE 5: Update penerima (jika ada perubahan)
      if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
        // Validate recipients: hanya bawahan yang valid (dari get-recipient)
        this.validateRecipients(
          barisData,
          dto.pengirim_position_id,
          dto.penerima_position_ids,
        );

        // Validasi semua penerima baru
        const penerimaDataList: PositionData[] = [];
        for (const penerimaId of dto.penerima_position_ids) {
          const penerimaData = this.findByPosition(barisData, penerimaId);
          if (!penerimaData) {
            throw new NotFoundException(
              `Penerima dengan position_id ${penerimaId} tidak ditemukan dalam org data`,
            );
          }
          penerimaDataList.push(penerimaData);
        }

        // Hapus penerima lama
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'penerima',
        });

        // Insert penerima baru dengan isDraft berdasarkan action
        for (let i = 0; i < penerimaDataList.length; i++) {
          const penerima = penerimaDataList[i];
          const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
            id: uuidv4(),
            idNaskah: naskahId,
            sirkuler: 'penerima',
            company: String(penerima.company || COMPANY_ID),
            companyText: penerima.company_name || 'PERUM LPPNPI',
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
            isDraft: isDraft, // isDraft based on action
            urutan: i, // urutan sesuai input form
          });
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // Update isDraft pada sirkulasi pengirim jika action = kirim
      if (!isDraft) {
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId, sirkuler: 'pengirim' },
          { isDraft: false },
        );

        // Jika penerima tidak diupdate, update isDraft pada penerima yang sudah ada
        if (
          !dto.penerima_position_ids ||
          dto.penerima_position_ids.length === 0
        ) {
          await queryRunner.manager.update(
            NaskahSirkulasi,
            { idNaskah: naskahId, sirkuler: 'penerima' },
            { isDraft: false },
          );
        }
      }

      // PHASE 6: Update lampiran (jika ada perubahan)
      // Only update lampiran if explicitly provided and contains items
      // If dto.lampiran is undefined, keep existing lampiran
      // If dto.lampiran is empty array [], it means user wants to clear all lampiran
      if (dto.lampiran !== undefined) {
        // Hapus lampiran lama
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });

        // Insert lampiran baru (if any)
        if (dto.lampiran && dto.lampiran.length > 0) {
          for (const lamp of dto.lampiran) {
            const lampiran = new NaskahLampiranEntity();
            lampiran.id = uuidv4();
            lampiran.id_naskah = naskahId;
            lampiran.file_name = lamp.nama_file;
            lampiran.file_pdf = lamp.url;
            lampiran.jenis = 'DI';
            await queryRunner.manager.save(lampiran);
          }
        }
      }

      // PHASE 6b: Handle lampiran_temp_ids - Update temporary lampiran to final
      // This handles newly uploaded lampiran via upload-temp-lampiran endpoint
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        // Update temporary lampiran: set id_naskah and is_temporary = 0
        await queryRunner.manager.update(
          NaskahLampiranEntity,
          { 
            id: In(dto.lampiran_temp_ids),
          },
          { 
            id_naskah: naskahId,
            is_temporary: 0,
          },
        );
      }

      // PHASE 7: Update tabel "di" (jika ada perubahan field konten)
      const hasDiFields =
        dto.kop_logo !== undefined ||
        dto.kop_judul !== undefined ||
        dto.nama_jabatan !== undefined ||
        dto.nomor_agenda !== undefined ||
        dto.tanggal_agenda !== undefined ||
        dto.surat_dari !== undefined ||
        dto.klasifikasi !== undefined ||
        dto.disposisi !== undefined ||
        dto.catatan !== undefined ||
        dto.paraf !== undefined;

      if (hasDiFields) {
        // Cek apakah sudah ada data di tabel "di"
        const existingDi = await this.diRepository.findOne({
          where: { idNaskah: naskahId },
        });

        if (existingDi) {
          // Update data yang ada
          if (dto.kop_logo !== undefined) existingDi.kopLogo = dto.kop_logo;
          if (dto.kop_judul !== undefined) existingDi.kopJudul = dto.kop_judul;
          if (dto.nama_jabatan !== undefined)
            existingDi.namaJabatan = dto.nama_jabatan;
          if (dto.nomor_agenda !== undefined)
            existingDi.nomorAgenda = dto.nomor_agenda;
          if (dto.tanggal_agenda !== undefined)
            existingDi.tanggalAgenda = new Date(dto.tanggal_agenda);
          if (dto.surat_dari !== undefined)
            existingDi.suratDari = dto.surat_dari;
          if (dto.klasifikasi !== undefined)
            existingDi.klasifikasi = dto.klasifikasi;
          if (dto.disposisi !== undefined) existingDi.disposisi = dto.disposisi;
          if (dto.catatan !== undefined) existingDi.catatan = dto.catatan;
          if (dto.paraf !== undefined) existingDi.paraf = dto.paraf;

          // Update juga dari dto lainnya jika ada
          if (dto.tanggal_disposisi)
            existingDi.tanggal = new Date(dto.tanggal_disposisi);
          if (dto.ref_nomor_surat) existingDi.nomor = dto.ref_nomor_surat;
          if (dto.perihal) existingDi.perihal = dto.perihal;

          await queryRunner.manager.save(existingDi);
        } else {
          // Insert data baru
          const diEntity = this.diRepository.create({
            idNaskah: naskahId,
            kopLogo: dto.kop_logo || '',
            kopJudul: dto.kop_judul || '',
            namaJabatan: dto.nama_jabatan || '',
            nomorAgenda: dto.nomor_agenda || '',
            tanggalAgenda: dto.tanggal_agenda
              ? new Date(dto.tanggal_agenda)
              : null,
            suratDari: dto.surat_dari || '',
            tanggal: dto.tanggal_disposisi
              ? new Date(dto.tanggal_disposisi)
              : naskah.tanggal || null,
            nomor: dto.ref_nomor_surat || '',
            perihal: dto.perihal || '',
            klasifikasi: dto.klasifikasi || '',
            kepadaYth: '', // Will be filled from penerima
            disposisi: dto.disposisi || '',
            catatan: dto.catatan || '',
            paraf: dto.paraf || '',
          });
          await queryRunner.manager.save(diEntity);
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

    // Get updated data for response (like ND finalizeDraft)
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const allSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    const pengirimDataResult = allSirkulasi.find(
      (s) => s.sirkuler === 'pengirim',
    );
    const penerimaDataResult = allSirkulasi.filter(
      (s) => s.sirkuler === 'penerima',
    );

    // Get lampiran
    const lampiranData = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // Get naskah_referensi
    const naskahRef = await this.naskahReferensiRepository.findOne({
      where: { id_naskah: naskahId },
    });

    // Get DI detail for disposisi & catatan
    const diData = await this.diRepository.findOne({
      where: { idNaskah: naskahId },
    });

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = updatedNaskah.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    // Helper function to convert sirkulasi to response format
    const sirkulasiToResponse = (s: NaskahSirkulasi | undefined) => {
      if (!s) {
        return {
          position_id: 0,
          position_text: '',
          persnum: null,
          nama: null,
          organization_id: 0,
          organization_text: '',
          sub_area: null,
          sub_area_text: null,
          area: null,
          area_text: null,
          company: 10000,
          company_name: 'PERUM LPPNPI',
        };
      }
      return {
        position_id: parseInt(s.position || '0', 10),
        position_text: s.positionText || '',
        persnum: s.idSirkuler ? parseInt(s.idSirkuler, 10) : null,
        nama: s.namaSirkuler || null,
        organization_id: parseInt(s.organization || '0', 10),
        organization_text: s.organizationText || '',
        sub_area: s.subArea ? parseInt(s.subArea, 10) : null,
        sub_area_text: s.subAreaText || null,
        area: s.area || null,
        area_text: s.areaText || null,
        company: 10000,
        company_name: 'PERUM LPPNPI',
      };
    };

    return {
      success: true,
      message: isDraft
        ? 'Draft disposisi berhasil diupdate'
        : 'Disposisi berhasil diupdate dan dikirim',
      data: {
        id: naskahId,
        jenis: 'DI',
        nomor: updatedNaskah?.nomor || null,
        tanggal: tanggalStr,
        status: isDraft ? ('draf' as const) : ('final' as const),
        sifat: updatedNaskah?.sifat || '',
        perihal: updatedNaskah?.perihal || '',
        pengirim: sirkulasiToResponse(pengirimDataResult),
        penerima: penerimaDataResult.map((s) => sirkulasiToResponse(s)),
        disposisi: diData?.disposisi || undefined,
        catatan: diData?.catatan || undefined,
        lampiran: lampiranData.map((l) => ({
          id: l.id,
          nama_file: l.file_name,
          url: l.file_pdf,
          tipe: 'DI',
        })),
        id_naskah_sebelumnya: naskahRef?.ref_nomor || null, // Using ref_nomor as reference to previous naskah
      },
    };
  }

  // ============================================================
  // SEND DRAFT - Kirim draft (ubah status draf ke final)
  // ============================================================

  /**
   * Send Draft - Kirim disposisi yang masih draft (ubah status menjadi final)
   * Sama seperti updateDraft tapi dengan action = 'kirim' (status final)
   *
   * @param naskahId - ID Naskah yang akan dikirim (dari path param)
   * @param dto - SendDraftDisposisiDto (sama seperti UpdateDraftDisposisiDto tanpa id_naskah dan action)
   * @returns SendDraftDisposisiResponseDto
   */
  async sendDraft(
    naskahId: string,
    dto: SendDraftDisposisiDto,
  ): Promise<SendDraftDisposisiResponseDto> {
    // Konversi ke UpdateDraftDisposisiDto dengan action = 'kirim'
    const updateDto: UpdateDraftDisposisiDto = {
      pengirim_position_id: dto.pengirim_position_id,
      penerima_position_ids: dto.penerima_position_ids,
      tanggal_disposisi: dto.tanggal_disposisi,
      sifat: dto.sifat,
      ref_nomor_surat: dto.ref_nomor_surat,
      perihal: dto.perihal,
      id_naskah_sebelumnya: dto.id_naskah_sebelumnya,
      disposisi: dto.disposisi,
      catatan: dto.catatan,
      lampiran: dto.lampiran,
      action: 'kirim', // Force action = kirim untuk send-draft
      kop_logo: dto.kop_logo,
      kop_judul: dto.kop_judul,
      nama_jabatan: dto.nama_jabatan,
      nomor_agenda: dto.nomor_agenda,
      tanggal_agenda: dto.tanggal_agenda,
      surat_dari: dto.surat_dari,
      klasifikasi: dto.klasifikasi,
      paraf: dto.paraf,
    };

    // Panggil updateDraft dengan naskahId dan action = 'kirim'
    const result = await this.updateDraft(naskahId, updateDto);

    // Return dengan format SendDraftDisposisiResponseDto (same as updateDraft but with final status)
    return {
      success: result.success,
      message: 'Draft disposisi berhasil dikirim',
      data: result.data
        ? {
            id: result.data.id,
            jenis: result.data.jenis,
            nomor: result.data.nomor || '',
            tanggal: result.data.tanggal,
            status: 'final' as const,
            sifat: result.data.sifat,
            perihal: result.data.perihal,
            pengirim: result.data.pengirim,
            penerima: result.data.penerima,
            disposisi: result.data.disposisi,
            catatan: result.data.catatan,
            lampiran: result.data.lampiran,
            id_naskah_sebelumnya: result.data.id_naskah_sebelumnya,
          }
        : undefined,
    };
  }

  // ============================================================
  // FORWARD DISPOSISI - Disposisi Lanjutan
  // ============================================================

  /**
   * Forward Disposisi - Meneruskan disposisi yang diterima ke bawahan
   *
   * Flow:
   * 1. Validasi user adalah penerima dari naskah yang akan di-forward
   * 2. Validasi user adalah managerial (bisa kirim disposisi)
   * 3. Validasi penerima baru adalah bawahan valid
   * 4. Buat naskah baru dengan referensi ke naskah sebelumnya
   * 5. Insert ke naskah_referensi dengan data dari naskah yang diterima
   *
   * @param dto - ForwardDisposisiDto
   * @returns ForwardDisposisiResponseDto
   */
  async forwardDisposisi(
    dto: ForwardDisposisiDto,
  ): Promise<ForwardDisposisiResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 1: Validasi naskah yang diterima exists
      const naskahDiterima = await this.naskahRepository.findOne({
        where: { id: dto.id_naskah_diterima },
      });

      if (!naskahDiterima) {
        throw new NotFoundException(
          `Naskah dengan ID ${dto.id_naskah_diterima} tidak ditemukan`,
        );
      }

      if (naskahDiterima.jenis !== 'DI') {
        throw new BadRequestException(
          `Naskah dengan ID ${dto.id_naskah_diterima} bukan disposisi (jenis: ${naskahDiterima.jenis})`,
        );
      }

      // PHASE 2: Validasi pengirim adalah penerima dari naskah sebelumnya
      const sirkulasiPenerima = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: dto.id_naskah_diterima,
          position: String(dto.pengirim_position_id),
          sirkuler: 'penerima',
        },
      });

      if (!sirkulasiPenerima) {
        throw new ForbiddenException(
          `Position ${dto.pengirim_position_id} bukan penerima dari naskah ${dto.id_naskah_diterima}. ` +
            `Hanya penerima disposisi yang bisa meneruskan disposisi.`,
        );
      }

      // PHASE 3: Get position data dan validasi pengirim adalah managerial
      const barisData = await this.getPositionData();
      const pengirimData = this.findByPosition(
        barisData,
        dto.pengirim_position_id,
      );

      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      if (pengirimData.chief !== 1) {
        throw new ForbiddenException(
          `Hanya managerial yang bisa forward Disposisi. Position ${dto.pengirim_position_id} bukan managerial.`,
        );
      }

      // Check barrier depth
      // DISABLED: Validation handled by frontend
      const senderLevel = Number(pengirimData.level);
      const barrierDepth = 3 - senderLevel;
      /*
      if (barrierDepth <= 0) {
        throw new ForbiddenException(
          `Position level ${senderLevel} tidak bisa forward Disposisi.`,
        );
      }
      */

      // PHASE 4: Validate all penerima baru
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima_position_ids) {
        const penerimaData = this.findByPosition(barisData, penerimaPositionId);
        if (!penerimaData) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaData);
      }

      // Validate recipients (hanya bawahan valid)
      this.validateRecipients(
        barisData,
        dto.pengirim_position_id,
        dto.penerima_position_ids,
      );

      // PHASE 5: Auto-generate nomor surat untuk forward disposisi dengan integrated numbering
      const naskahId = uuidv4();
      const tanggalDisposisi = new Date(dto.tanggal_disposisi);

      // Perihal: gunakan dari dto atau dari naskah sebelumnya
      const perihal = dto.perihal || naskahDiterima.perihal || '';

      // Generate nomor surat baru untuk disposisi lanjutan dengan integrasi
      const generatedNomor = await this.generateNomorWithIntegration(
        pengirimData,
        perihal,
        tanggalDisposisi,
        queryRunner
      );

      // Calculate total lampiran count (from previous + new)
      let totalLampiranCount = 0;
      if (dto.copy_lampiran_from_previous !== false) {
        const previousLampiranCount = await this.naskahLampiranRepository.count({
          where: { id_naskah: dto.id_naskah_diterima },
        });
        totalLampiranCount += previousLampiranCount;
      }
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        totalLampiranCount += dto.lampiran_temp_ids.length;
      }
      if (dto.lampiran && dto.lampiran.length > 0) {
        totalLampiranCount += dto.lampiran.length;
      }

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'DI',
        sifat: dto.sifat,
        nomor: generatedNomor, // Nomor baru yang di-generate dengan integrasi
        tanggal: tanggalDisposisi,
        perihal: perihal,
        konten: dto.disposisi || undefined,
        status: 'final',
        lampiran: totalLampiranCount > 0 ? `${totalLampiranCount} file` : undefined,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 6: Insert ke naskah_referensi (referensi ke naskah yang diterima)
      // ref_nomor otomatis dari nomor naskah disposisi sebelumnya
      const naskahReferensi = new NaskahReferensiEntity();
      naskahReferensi.id = uuidv4();
      naskahReferensi.id_naskah = naskahId;
      naskahReferensi.ref_jenis = naskahDiterima.jenis || 'DI';
      naskahReferensi.ref_pengirim = sirkulasiPenerima.namaSirkuler || null; // Pengirim asli
      naskahReferensi.ref_tanggal = naskahDiterima.tanggal || null;
      naskahReferensi.ref_nomor = naskahDiterima.nomor || null; // Nomor dari naskah sebelumnya (auto)
      naskahReferensi.ref_perihal = naskahDiterima.perihal || null;
      await queryRunner.manager.save(naskahReferensi);

      // PHASE 7: Insert sirkulasi pengirim
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirimData.company || COMPANY_ID),
        companyText: pengirimData.company_name || 'PERUM LPPNPI',
        area: pengirimData.area || '',
        areaText: pengirimData.area_text || '',
        subArea: pengirimData.sub_area ? String(pengirimData.sub_area) : '',
        subAreaText: pengirimData.sub_area_text || '',
        organization: String(pengirimData.organization_id),
        organizationText: pengirimData.organization_text,
        position: String(pengirimData.position),
        positionText: pengirimData.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirimData.persnum_person
          ? String(pengirimData.persnum_person)
          : '',
        namaSirkuler: pengirimData.persnum_person_text || '',
        isDraft: false,
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 8: Insert sirkulasi penerima
      const penerimaResponses: DisposisiSirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaDataList.length; i++) {
        const penerima = penerimaDataList[i];
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: penerima.company_name || 'PERUM LPPNPI',
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
          urutan: i, // urutan sesuai input form
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 9: Insert lampiran
      const lampiranResponses: Array<{
        id: string;
        nama_file: string;
        url: string;
        tipe?: string;
      }> = [];

      // Option 1: Copy lampiran dari naskah sebelumnya (default behavior)
      if (dto.copy_lampiran_from_previous !== false) {
        // Get lampiran dari naskah yang diterima
        const previousLampiran = await this.naskahLampiranRepository.find({
          where: { id_naskah: dto.id_naskah_diterima },
        });

        if (previousLampiran.length > 0) {
          console.log(`[DI forward] Copying ${previousLampiran.length} lampiran from previous naskah`);
          
          // Copy lampiran dengan ID baru tapi file_pdf sama (reference ke file yang sama)
          for (const prevLamp of previousLampiran) {
            const newLampiranId = uuidv4();
            const newLampiran = this.naskahLampiranRepository.create({
              id: newLampiranId,
              id_naskah: naskahId,
              file_name: prevLamp.file_name,
              file_pdf: prevLamp.file_pdf, // Reference ke file yang sama, tidak perlu copy file
              jenis: 'DI',
              is_temporary: 0, // Final
            });
            await queryRunner.manager.save(newLampiran);

            lampiranResponses.push({
              id: newLampiranId,
              nama_file: prevLamp.file_name,
              url: prevLamp.file_pdf,
            });
          }
        }
      }

      // Option 2: Handle temporary lampiran TAMBAHAN (bisa dikombinasi dengan copy)
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        console.log(`[DI forward] Adding ${dto.lampiran_temp_ids.length} new lampiran from temporary`);
        
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'DI',
          'disposisi/lampiran',
        );

        // Fetch moved lampiran untuk response
        const movedLampiran = await this.naskahLampiranRepository.find({
          where: { 
            id_naskah: naskahId,
            id: In(dto.lampiran_temp_ids),
          },
        });

        for (const lamp of movedLampiran) {
          lampiranResponses.push({
            id: lamp.id,
            nama_file: lamp.file_name,
            url: lamp.file_pdf,
          });
        }
      }
      
      // Option 3: Legacy direct lampiran upload (deprecated)
      else if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'DI',
          });
          await queryRunner.manager.save(lampiran);

          lampiranResponses.push({
            id: lampiranId,
            nama_file: lamp.nama_file,
            url: lamp.url,
            tipe: lamp.tipe,
          });
        }
      }

      // PHASE 10: Insert ke tabel DI
      const kepadaYthList = penerimaDataList.map(
        (p) => `${p.position_text} ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const diEntity = this.diRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? null,
        kopJudul: dto.kop_judul ?? 'LEMBAR DISPOSISI',
        namaJabatan: dto.nama_jabatan ?? pengirimData.position_text,
        nomorAgenda: dto.nomor_agenda ?? null,
        tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
        suratDari: dto.surat_dari ?? null,
        tanggal: tanggalDisposisi,
        nomor: generatedNomor, // Nomor baru yang di-generate dengan integrasi
        perihal: perihal,
        klasifikasi: dto.klasifikasi ?? null,
        kepadaYth: kepadaYth,
        disposisi: dto.disposisi ?? null,
        catatan: dto.catatan ?? null,
        paraf: dto.paraf ?? null,
      });
      await queryRunner.manager.save(diEntity);

      // PHASE 11: Auto-generate PDF with lampiran (for forward, status is always 'final')
      let finalPdfPath: string | undefined = undefined;
      try {
        // Parse disposisi string to array
        let disposisiArray: string[] = [];
        if (dto.disposisi) {
          if (Array.isArray(dto.disposisi)) {
            disposisiArray = dto.disposisi;
          } else if (typeof dto.disposisi === 'string') {
            disposisiArray = dto.disposisi.split('\n').map(s => s.trim()).filter(s => s.length > 0);
          }
        }
        
        // Auto-check "Lainnya" if catatan is filled
        if (dto.catatan && dto.catatan.trim().length > 0 && !disposisiArray.includes('Lainnya')) {
          disposisiArray.push('Lainnya');
        }
        console.log('[DI forward] disposisiArray:', disposisiArray);

        // Get reference data from naskah sebelumnya (naskah yang diterima)
        let refNomor = naskahDiterima.nomor || '';
        let refPerihal = naskahDiterima.perihal || '';
        let refTanggal = '';
        let refPengirim = '';
        
        if (naskahDiterima.tanggal) {
          const refDate = new Date(naskahDiterima.tanggal);
          refTanggal = refDate.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }

        // Get pengirim asli dari naskah sebelumnya
        const pengirimAsli = await this.naskahSirkulasiRepository.findOne({
          where: {
            idNaskah: dto.id_naskah_diterima,
            sirkuler: 'pengirim',
          },
        });
        if (pengirimAsli) {
          refPengirim = `${pengirimAsli.positionText} ${pengirimAsli.organizationText}`;
        }

        // Generate PDF with all data
        let pdfBuffer = await this.generatePdfDispoService.generatePdf({
          html: '',
          penerima: kepadaYthList,
          disposisi: disposisiArray,
          sifat: dto.sifat || 'Biasa',
          pengirim: `${pengirimData.position_text} ${pengirimData.organization_text}`,
          tembusan: [],
          perihal: perihal,
          refNomor: refNomor,
          refPerihal: refPerihal,
          refTanggal: refTanggal,
          refPengirim: refPengirim,
          tanggal: tanggalDisposisi.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          catatan: dto.catatan || '',
        });

        // Merge with lampiran if any (dari copy previous atau temporary baru)
        if (lampiranResponses.length > 0) {
          // Get all lampiran IDs
          const allLampiranIds = lampiranResponses.map(l => l.id);
          const lampiranFiles = await this.getTemporaryLampiranFiles(allLampiranIds);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
            console.log('[DI forward] Merged with', lampiranFiles.length, 'lampiran files');
          }
        }

        // Upload PDF to storage
        const timestamp = Date.now();
        const pdfFileName = `DI-${generatedNomor.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'disposisi/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        console.log('[DI forward] PDF auto-generated:', finalPdfPath);
      } catch (error) {
        console.error('[DI forward] Failed to auto-generate PDF:', error);
        // Don't fail the whole transaction if PDF generation fails
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: 'Disposisi berhasil diteruskan',
        data: {
          id: naskahId,
          jenis: 'DI',
          tanggal: dto.tanggal_disposisi,
          status: 'final',
          sifat: dto.sifat,
          nomor: generatedNomor, // Nomor baru yang di-generate dengan integrasi
          perihal: perihal,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          disposisi: dto.disposisi,
          catatan: dto.catatan,
          lampiran:
            lampiranResponses.length > 0 ? lampiranResponses : undefined,
          referensi: {
            id_naskah: dto.id_naskah_diterima,
            nomor: naskahDiterima.nomor, // ref_nomor dari naskah sebelumnya
            perihal: naskahDiterima.perihal,
            tanggal: naskahDiterima.tanggal,
            jenis: naskahDiterima.jenis,
          },
          final_pdf: finalPdfPath, // Include generated PDF path in response
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
   * Get detail Disposisi by naskah ID
   * Mengembalikan flow lengkap disposisi dari awal sampai akhir
   * Urutan: Terbaru di atas (level tertinggi), awal di bawah (level 0)
   */
  async getDisposisiDetail(naskahId: string): Promise<any> {
    // Get naskah data
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.jenis !== 'DI') {
      throw new NotFoundException(`Naskah bukan Disposisi (DI)`);
    }

    // ============================================================
    // BUILD FULL CHAIN / RANGKAIAN
    // ============================================================
    
    // STEP 1: Trace backward to find root
    let rootNaskahId = naskahId;
    let currentId = naskahId;
    const visitedIds = new Set<string>([currentId]);
    
    while (true) {
      const referensi = await this.naskahReferensiRepository.findOne({
        where: { id_naskah: currentId },
      });

      if (!referensi || !referensi.ref_nomor) {
        rootNaskahId = currentId;
        break;
      }

      const parentNaskah = await this.naskahRepository.findOne({
        where: { 
          nomor: referensi.ref_nomor,
          jenis: 'DI',
        },
      });

      if (!parentNaskah || visitedIds.has(parentNaskah.id)) {
        rootNaskahId = currentId;
        break;
      }

      visitedIds.add(parentNaskah.id);
      currentId = parentNaskah.id;
    }

    // STEP 2: Build flow from root forward
    const flow: any[] = [];
    const naskahIdToLevel = new Map<string, number>();
    
    // Helper function to build node data for flow
    const buildFlowNode = async (
      naskahData: NaskahEntity,
      level: number,
    ): Promise<any> => {
      // Get pengirim
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskahData.id,
          sirkuler: 'pengirim',
        },
      });

      // Get penerima list
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskahData.id,
          sirkuler: 'penerima',
        },
        order: { urutan: 'ASC', createdAt: 'ASC' },
      });

      // Get lampiran count
      const lampiranCount = await this.naskahLampiranRepository.count({
        where: { id_naskah: naskahData.id },
      });

      // Get lampiran files
      const lampiranFiles = await this.naskahLampiranRepository.find({
        where: { id_naskah: naskahData.id },
      });

      // Get DI data
      const diData = await this.diRepository.findOne({
        where: { idNaskah: naskahData.id },
      });

      // Format tanggal
      const tanggalStr = naskahData.tanggal
        ? (naskahData.tanggal instanceof Date
            ? naskahData.tanggal.toISOString().split('T')[0]
            : String(naskahData.tanggal).split('T')[0])
        : null;

      const tanggalAgendaStr = diData?.tanggalAgenda
        ? (diData.tanggalAgenda instanceof Date
            ? diData.tanggalAgenda.toISOString().split('T')[0]
            : String(diData.tanggalAgenda).split('T')[0])
        : null;

      // Get final PDF URL
      const finalPdfUrl = naskahData.final_pdf
        ? await this.storageService.getFileUrl(naskahData.final_pdf)
        : null;

      // Build pengirim info
      const pengirimInfo = pengirimSirkulasi
        ? {
            position_id: pengirimSirkulasi.position || '',
            position_text: pengirimSirkulasi.positionText || '',
            organization_text: pengirimSirkulasi.organizationText || '',
            nama: pengirimSirkulasi.namaSirkuler || null,
          }
        : null;

      // Build penerima list with read status
      const penerimaInfo = penerimaList.map((p) => ({
        position_id: p.position || '',
        position_text: p.positionText || '',
        organization_text: p.organizationText || '',
        nama: p.namaSirkuler || null,
        status_baca: p.sendReadTime ? 'terbaca' : 'belum_dibaca',
        read_time: p.sendReadTime ? p.sendReadTime.toISOString() : null,
      }));

      // Build lampiran info
      const lampiranInfo = await Promise.all(
        lampiranFiles.map(async (l) => ({
          id: l.id,
          file_name: l.file_name || '',
          file_path: l.file_pdf || '',
          file_url: l.file_pdf
            ? await this.storageService.getFileUrl(l.file_pdf)
            : null,
        })),
      );

      return {
        id: naskahData.id,
        jenis: naskahData.jenis,
        nomor: naskahData.nomor,
        tanggal: tanggalStr,
        perihal: naskahData.perihal,
        sifat: naskahData.sifat,
        status: naskahData.status,
        
        // DI specific fields
        kop_logo: diData?.kopLogo || null,
        kop_judul: diData?.kopJudul || null,
        nama_jabatan: diData?.namaJabatan || null,
        nomor_agenda: diData?.nomorAgenda || null,
        tanggal_agenda: tanggalAgendaStr,
        surat_dari: diData?.suratDari || null,
        kepada_yth: diData?.kepadaYth || null,
        klasifikasi: diData?.klasifikasi || naskahData.klasifikasi || null,
        
        // Disposisi content
        disposisi: diData?.disposisi || null,
        catatan: diData?.catatan || null,
        paraf: diData?.paraf || null,
        
        // Sirkulasi
        pengirim: pengirimInfo,
        penerima: penerimaInfo,
        
        // Lampiran
        lampiran: naskahData.lampiran || null,
        jumlah_lampiran: lampiranCount,
        lampiran_files: lampiranInfo,
        
        // PDF
        final_pdf: naskahData.final_pdf || null,
        final_pdf_url: finalPdfUrl,
        
        // Level in chain
        level: level,
      };
    };

    // Build root node
    const rootNaskah = await this.naskahRepository.findOne({
      where: { id: rootNaskahId },
    });

    if (rootNaskah) {
      const rootNode = await buildFlowNode(rootNaskah, 0);
      flow.push(rootNode);
      naskahIdToLevel.set(rootNaskahId, 0);

      // STEP 3: Recursively find all forwards
      const findAllForwards = async (parentNaskah: NaskahEntity, parentLevel: number) => {
        if (!parentNaskah.nomor) return;

        const allReferensi = await this.naskahReferensiRepository
          .createQueryBuilder('ref')
          .where('ref.ref_nomor = :nomor', { nomor: parentNaskah.nomor })
          .andWhere('ref.ref_jenis = :jenis', { jenis: 'DI' })
          .getMany();

        for (const ref of allReferensi) {
          if (!ref.id_naskah || naskahIdToLevel.has(ref.id_naskah)) {
            continue;
          }

          const childNaskah = await this.naskahRepository.findOne({
            where: { id: ref.id_naskah, jenis: 'DI' },
          });

          if (childNaskah) {
            const childLevel = parentLevel + 1;
            const childNode = await buildFlowNode(childNaskah, childLevel);
            flow.push(childNode);
            naskahIdToLevel.set(childNaskah.id, childLevel);

            await findAllForwards(childNaskah, childLevel);
          }
        }
      };

      await findAllForwards(rootNaskah, 0);
    }

    // Sort flow by level DESCENDING (terbaru di atas, awal di bawah)
    flow.sort((a, b) => b.level - a.level);

    // Build response - hanya flow saja
    return {
      success: true,
      data: {
        flow: flow,
        total_flow: flow.length,
      },
    };
  }
}

