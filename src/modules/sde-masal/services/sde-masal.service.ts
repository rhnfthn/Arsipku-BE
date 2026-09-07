import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import PizZip from 'pizzip';
import { v4 as uuidv4 } from 'uuid';
import { SdeMasalEntity } from '../entities/sde-masal.entity';
import { UpdateSdeMasalDto } from '../dto/update-sde-masal.dto';
import { SdeMasalFilterDto } from '../dto/sde-masal-filter.dto';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { SdeMasalFolderEntity } from '../entities/sde-masal-folder.entity';
import { CreateSdeMasalFolderDto } from '../dto/create-sde-masal-folder.dto';
import { SuratDinasEksternalService } from '../../surat-dinas-eksternal/services/surat-dinas-eksternal.service';
import { StorageService } from '../../storage/services/storage.service';
import {
  CreateSuratDinasEksternalDto,
  SignOption,
  SifatSurat,
} from '../../surat-dinas-eksternal/dto/create-surat-dinas-eksternal.dto';

const COMPANY_ID = 10000; // PERUM LPPNPI

type SdeMasalVerifikator = {
  urutan: number;
  persnum: string;
  position: string;
  nama: string;
  jabatan: string;
  status: 'pending' | 'waiting' | 'verified' | 'rejected';
  verifiedAt?: string | null;
  rejectedAt?: string | null;
  catatan?: string | null;
};

type SdeMasalAttachmentRef = {
  fileName: string;
  key: string;
  sha256: string;
  size?: number;
  url?: string;
};

const MAX_MASS_ATTACHMENT_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_MASS_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MASS_ATTACHMENT_FILES = 200;
const MAX_MASS_ATTACHMENT_TOTAL_BYTES = 200 * 1024 * 1024;

/**
 * Service untuk fitur SDE Masal (Surat Dinas Eksternal Massal).
 *
 * SDE Masal = SDE biasa × N. Folder menyimpan metadata yang sama untuk
 * semua surat. Setiap baris Excel → 1 record `sde_masal` (hanya
 * folderId + recipientData JSON). Saat finalize, 1 naskah SDE lengkap
 * dibuat per penerima memakai helper SDE service yang sudah ada.
 */
@Injectable()
export class SdeMasalService {
  private readonly logger = new Logger(SdeMasalService.name);

  constructor(
    @InjectRepository(SdeMasalEntity)
    private readonly repo: Repository<SdeMasalEntity>,
    @InjectRepository(SdeMasalFolderEntity)
    private readonly folderRepo: Repository<SdeMasalFolderEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
    private readonly orgDataService: OrgDataService,
    private readonly dataSource: DataSource,
    private readonly sdeService: SuratDinasEksternalService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================================
  // FOLDER CRUD
  // ============================================================

  async createFolder(
    dto: CreateSdeMasalFolderDto,
  ): Promise<SdeMasalFolderEntity> {
    const entity = this.folderRepo.create({
      id: uuidv4(),
      judul: dto.judul.trim(),
      parentNaskahId: dto.parentNaskahId || null,
      tanggal: dto.tanggal ? new Date(dto.tanggal) : null,
      klasifikasi: dto.klasifikasi || null,
      klasifikasiText: dto.klasifikasiText || null,
      pengirimId: dto.pengirimId || null,
      pengirimName: dto.pengirimName || null,
      sifat: dto.sifat || 'biasa',
      atasNama: dto.atasNama || null,
      atasNamaPositionId: dto.atasNamaPositionId || null,
      kontenTemplate: dto.kontenTemplate || null,
      dynamicVariables: dto.dynamicVariables || [],
      originalFileUrl: dto.originalFileUrl || null,
      signOption: dto.signOption || null,
      status: 'DRAFT',
      createdBy: dto.createdBy || null,
    });
    return this.folderRepo.save(entity);
  }

  async updateFolder(
    id: string,
    data: Partial<CreateSdeMasalFolderDto>,
  ): Promise<SdeMasalFolderEntity> {
    const folder = await this.folderRepo.findOne({ where: { id } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');

    if (data.judul !== undefined) folder.judul = data.judul.trim();
    if (data.parentNaskahId !== undefined)
      folder.parentNaskahId = data.parentNaskahId || null;
    if (data.tanggal !== undefined)
      folder.tanggal = data.tanggal ? new Date(data.tanggal) : null;
    if (data.klasifikasi !== undefined)
      folder.klasifikasi = data.klasifikasi || null;
    if (data.klasifikasiText !== undefined)
      folder.klasifikasiText = data.klasifikasiText || null;
    if (data.pengirimId !== undefined)
      folder.pengirimId = data.pengirimId || null;
    if (data.pengirimName !== undefined)
      folder.pengirimName = data.pengirimName || null;
    if (data.sifat !== undefined) folder.sifat = data.sifat || 'biasa';
    if (data.atasNama !== undefined) folder.atasNama = data.atasNama || null;
    if (data.atasNamaPositionId !== undefined)
      folder.atasNamaPositionId = data.atasNamaPositionId || null;
    if (data.kontenTemplate !== undefined)
      folder.kontenTemplate = data.kontenTemplate || null;
    if (data.dynamicVariables !== undefined)
      folder.dynamicVariables = data.dynamicVariables || [];
    if (data.originalFileUrl !== undefined)
      folder.originalFileUrl = data.originalFileUrl || null;
    if (data.signOption !== undefined)
      folder.signOption = data.signOption || null;
    return this.folderRepo.save(folder);
  }

  // ============================================================
  // GENERATE MASSAL — hanya insert sde_masal (tidak buat naskah)
  // ============================================================

  /**
   * Generate massal SDE dari data wizard.
   * Untuk setiap baris penerima yang valid, insert 1 record `sde_masal`
   * dengan folderId + recipientData (JSON). Naskah dibuat saat finalize.
   */
  async generateMassal(body: {
    folderId?: string;
    konsep?: any;
    penerimaList: any[];
    template?: any;
    createdBy?: string;
  }): Promise<{
    total: number;
    success: number;
    failed: number;
    items: SdeMasalEntity[];
  }> {
    const { penerimaList } = body;
    if (!penerimaList || penerimaList.length === 0) {
      throw new BadRequestException('Data penerima tidak boleh kosong');
    }
    if (penerimaList.length > 1000) {
      throw new BadRequestException('Maksimal 1000 penerima per generate');
    }

    const folder = body.folderId
      ? await this.folderRepo.findOne({ where: { id: body.folderId } })
      : null;
    if (body.folderId && !folder) {
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    }

    // Simpan template ke folder jika diberikan
    if (folder && body.template) {
      folder.kontenTemplate = body.template.konten || folder.kontenTemplate;
      folder.dynamicVariables = Array.from(
        new Set(
          penerimaList.flatMap((item) =>
            Object.keys(item?.variables || {}).filter(
              (key) =>
                ![
                  'tertuju',
                  'perihal',
                  'tembusan',
                  'tembusan_internal',
                  'tembusan_eksternal',
                ].includes(key),
            ),
          ),
        ),
      );
    }

    const items: SdeMasalEntity[] = [];
    let failed = 0;

    for (const p of penerimaList) {
      try {
        if (p.isValid === false) {
          failed++;
          continue;
        }
        const item = this.repo.create({
          folderId: body.folderId || null,
          recipientData: JSON.stringify(p),
          statusVerifikasi: 'MENUNGGU',
          createdBy: body.createdBy || null,
        });
        items.push(item);
      } catch (err) {
        this.logger.warn(`Failed to generate item: ${err?.message ?? err}`);
        failed++;
      }
    }

    let saved: SdeMasalEntity[] = [];
    if (items.length > 0) {
      saved = await this.repo.save(items);
    }

    return {
      total: penerimaList.length,
      success: saved.length,
      failed,
      items: saved,
    };
  }

  // ============================================================
  // FINALIZE — buat 1 naskah SDE lengkap per penerima
  // ============================================================

  async finalizeNaskah(
    sdeMasalId: string,
    signOption: 'digsig' | 'qr_only' | 'ttd_basah',
    passphrase?: string,
    creatorPosition?: string | number,
    persnum?: number,
  ): Promise<{ naskahId: string; nomor: string; status: string }> {
    const item = await this.repo.findOne({ where: { id: sdeMasalId } });
    if (!item) throw new NotFoundException('Item SDE Massal tidak ditemukan');

    if (item.naskahId) {
      const existing = await this.naskahRepository.findOne({
        where: { id: item.naskahId },
      });
      return {
        naskahId: item.naskahId,
        nomor: existing?.nomor || '',
        status: existing?.status || item.statusVerifikasi,
      };
    }

    const folder = item.folderId
      ? await this.folderRepo.findOne({ where: { id: item.folderId } })
      : null;
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');

    const tanggal = folder.tanggal
      ? new Date(folder.tanggal).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const orgData = await this.orgDataService.findOrg(tanggal);
    const pengirim = orgData?.position_json?.find(
      (position: any) =>
        Number(position.position) === Number(folder.pengirimId),
    );
    if (!pengirim || pengirim.chief !== 1) {
      throw new ForbiddenException(
        'Penandatangan tidak ditemukan atau bukan pejabat managerial aktif',
      );
    }

    const recipient = this.parseRecipientData(item);
    const attachmentRefs = this.getAttachmentRefs(item, recipient);
    const external = await this.resolveRecipientExternal(
      folder,
      item,
      recipient,
    );
    // Resolve tembusan eksternal ke list bernomor dengan nama eksternal
    const tembusanList = await this.resolveTembusanList(folder, {
      ...recipient,
      tembusan: recipient.tembusanEksternal || recipient.tembusan || '',
    });
    const konten = this.renderFolderKonten(folder, item, {
      ...recipient,
      tembusan:
        tembusanList || recipient.tembusanEksternal || recipient.tembusan || '',
      tembusan_internal: recipient.tembusanInternal || '',
      tembusan_eksternal: recipient.tembusanEksternal || '',
    });
    const internalTembusan = this.parseInternalTembusan(recipient);
    const normalizedSignOption = signOption || folder.signOption || 'qr_only';

    const dto: CreateSuratDinasEksternalDto = {
      pengirim: Number(folder.pengirimId),
      penerima: [external.id],
      tgl: tanggal,
      id_referensi_naskah: folder.parentNaskahId || undefined,
      klasifikasi: folder.klasifikasi || '',
      klasifikasi_text: folder.klasifikasiText || undefined,
      sifat: (folder.sifat || 'biasa') as SifatSurat,
      perihal: recipient.perihal || '-',
      konten,
      nama_tempat: pengirim.area_text || undefined,
      nama_jabatan: pengirim.position_text || undefined,
      nama_lengkap:
        pengirim.persnum_person_text || folder.pengirimName || undefined,
      atas_nama: folder.atasNama || undefined,
      atas_nama_position_id: folder.atasNamaPositionId
        ? Number(folder.atasNamaPositionId)
        : undefined,
      tembusan: internalTembusan,
      sign_option: normalizedSignOption as SignOption,
      passphrase,
      lampiran:
        attachmentRefs.length > 0
          ? attachmentRefs.map((ref) => ref.fileName).join(', ')
          : undefined,
      lampiran_direct_refs:
        attachmentRefs.length > 0
          ? attachmentRefs.map((ref) => ({ fileName: ref.fileName, key: ref.key }))
          : undefined,
    };

    if (
      creatorPosition &&
      String(creatorPosition) !== String(folder.pengirimId)
    ) {
      this.logger.warn(
        `Finalisasi item ${item.id} dijalankan oleh position ${creatorPosition} untuk penandatangan ${folder.pengirimId}`,
      );
    }

    try {
      const response: any = await this.sdeService.sendMessage(dto, persnum);
      const data = response?.data;
      if (!data?.id)
        throw new Error('Layanan SDE tidak mengembalikan ID naskah');

      item.naskahId = data.id;
      item.statusVerifikasi = 'TERKIRIM';
      item.errorMessage = null;
      await this.repo.save(item);
      await this.addExternalTembusan(data.id, item, recipient, data.status);
      // Tembusan internal: masukkan ke kotak masuk tiap akun internal
      await this.addInternalTembusan(data.id, item, recipient, data.status);
      await this.refreshFolderCounters(folder.id);

      // Kirim email otomatis ke alamat dari kolom Excel
      // (email_tertuju → to, email_cc → cc, email_bcc → bcc).
      await this.sendEmailForItem(
        data.id,
        recipient,
        external,
        pengirim,
        folder,
        creatorPosition,
        persnum,
      );

      return {
        naskahId: data.id,
        nomor: data.nomor || '',
        status: data.status || 'final',
      };
    } catch (error) {
      item.statusVerifikasi = 'GAGAL';
      item.errorMessage = String(error?.message || error).slice(0, 500);
      await this.repo.save(item);
      await this.refreshFolderCounters(folder.id);
      throw error;
    }
  }

  /**
   * Kirim email otomatis ke alamat dari kolom Excel (email_tertuju/cc/bcc).
   * Dipanggil setelah naskah berhasil difinalisasi. Gagal kirim email TIDAK
   * menggagalkan finalisasi (hanya dicatat di log).
   */
  private async sendEmailForItem(
    naskahId: string,
    recipient: Record<string, any>,
    external: EksternalEntity,
    pengirim: any,
    folder: SdeMasalFolderEntity,
    creatorPosition?: string | number,
    persnum?: number,
  ): Promise<void> {
    const to =
      String(recipient.emailTertuju || recipient.email_tertuju || '').trim() ||
      external.email ||
      '';
    const cc = String(recipient.emailCc || recipient.email_cc || '').trim();
    const bcc = String(recipient.emailBcc || recipient.email_bcc || '').trim();

    if (!to) {
      this.logger.warn(
        `[SDE Masal] Item ${naskahId} tidak punya email tujuan, skip kirim email.`,
      );
      return;
    }

    const senderPersnum = persnum
      ? Number(persnum)
      : pengirim?.persnum_person
        ? Number(pengirim.persnum_person)
        : undefined;
    const senderNama =
      pengirim?.persnum_person_text ||
      pengirim?.nama ||
      folder.pengirimName ||
      '';

    try {
      await this.sdeService.sendSdeEmail(
        naskahId,
        String(folder.pengirimId || creatorPosition || ''),
        senderPersnum as number,
        senderNama,
        { to, cc, bcc },
      );
      this.logger.log(
        `[SDE Masal] Email terkirim untuk item ${naskahId} → ${to}`,
      );
    } catch (error) {
      this.logger.warn(
        `[SDE Masal] Gagal kirim email item ${naskahId} → ${to}: ${error?.message || error}`,
      );
    }
  }

  /**
   * Kirim ulang naskah yang gagal (status GAGAL).
   * Memakai signOption yang tersimpan di folder. Hanya item GAGAL yang boleh
   * di-retry; item TERKIRIM akan ditolak.
   */
  async retryNaskah(
    itemId: string,
    creatorPosition?: string | number,
    persnum?: number,
  ): Promise<{ naskahId: string; nomor: string; status: string }> {
    const item = await this.repo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item SDE Masal tidak ditemukan');
    if (item.statusVerifikasi === 'TERKIRIM') {
      throw new BadRequestException('Naskah ini sudah terkirim');
    }
    if (!item.folderId) {
      throw new BadRequestException('Item tidak terhubung ke folder manapun');
    }
    const folder = await this.folderRepo.findOne({
      where: { id: item.folderId },
    });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(creatorPosition || '') !== String(folder.pengirimId || '')) {
      throw new ForbiddenException(
        'Hanya penandatangan SDE Massal ini yang dapat mengirim ulang',
      );
    }

    const signOption = folder.signOption || 'qr_only';
    await this.finalizeNaskah(
      item.id,
      signOption,
      undefined,
      creatorPosition,
      persnum,
    );
    const updated = await this.repo.findOne({ where: { id: itemId } });
    return {
      naskahId: updated?.naskahId || '',
      nomor: '',
      status: updated?.statusVerifikasi || 'UNKNOWN',
    };
  }

  /**
   * Upload lampiran per item (pdf/zip) ke MinIO, simpan key di sde_masal.lampiran.
   */
  async uploadLampiran(
    itemId: string,
    file: Express.Multer.File,
  ): Promise<{ lampiran: string; url: string }> {
    const item = await this.repo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item SDE Masal tidak ditemukan');

    if (!file) throw new BadRequestException('File tidak ditemukan');

    // Validasi format: pdf atau zip
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    if (!['pdf', 'zip'].includes(ext || '')) {
      throw new BadRequestException('Format lampiran harus PDF atau ZIP');
    }

    const result = await this.storageService.uploadFile(
      file,
      'sde-masal/lampiran',
    );

    item.lampiran = result.key;
    await this.repo.save(item);

    return { lampiran: result.key, url: result.url };
  }

  /**
   * Download lampiran per item dari MinIO.
   */
  async downloadLampiran(
    itemId: string,
  ): Promise<{ buffer: Buffer; mimetype: string; filename: string }> {
    const item = await this.repo.findOne({ where: { id: itemId } });
    if (!item || !item.lampiran) {
      throw new NotFoundException('Lampiran tidak ditemukan');
    }

    const buffer = await this.storageService.getFile(item.lampiran);
    const filename = item.lampiran.split('/').pop() || 'lampiran';
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimetype = ext === 'pdf' ? 'application/pdf' : 'application/zip';

    return { buffer, mimetype, filename };
  }

  async downloadMassAttachment(
    itemId: string,
    attachmentIndex: number,
    positionId?: string | number,
    persnum?: string | number,
  ): Promise<{ buffer: Buffer; mimetype: string; filename: string }> {
    const item = await this.repo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item SDE Massal tidak ditemukan');
    if (item.folderId) {
      await this.findNaskahInFolder(
        item.folderId,
        String(positionId || ''),
        String(persnum || ''),
      );
    }
    const recipient = this.parseRecipientData(item);
    const attachments = this.getAttachmentRefs(item, recipient);
    const attachment = attachments[attachmentIndex];
    if (!attachment?.key) throw new NotFoundException('Lampiran tidak ditemukan');
    const buffer = await this.storageService.getFile(attachment.key);
    return {
      buffer,
      mimetype: 'application/pdf',
      filename: attachment.fileName || `lampiran-${attachmentIndex + 1}.pdf`,
    };
  }

  /**
   * Membaca ZIP, memvalidasi seluruh isinya, lalu menyimpan PDF unik dengan
   * object key berbasis SHA-256. Database belum diubah sampai commit dipanggil.
   */
  async prepareMassAttachments(
    folderId: string,
    file: Express.Multer.File,
    requestedFileNames: string[] = [],
    creatorPosition?: string | number,
  ): Promise<{
    files: SdeMasalAttachmentRef[];
    matched: Record<string, SdeMasalAttachmentRef>;
    missing: string[];
    uploadedCount: number;
    reusedCount: number;
  }> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    const isSigner = String(creatorPosition || '') === String(folder.pengirimId || '');
    const isCreator = String(creatorPosition || '') === String(folder.createdBy || '');
    if (!isSigner && !isCreator) {
      throw new ForbiddenException('Anda bukan pembuat atau penandatangan SDE Massal ini');
    }
    if (!file?.buffer || file.size > MAX_MASS_ATTACHMENT_ZIP_BYTES) {
      throw new BadRequestException('Ukuran ZIP lampiran maksimal 50MB');
    }
    if (!/\.zip$/i.test(file.originalname || '')) {
      throw new BadRequestException('File lampiran massal harus berformat ZIP');
    }

    let zip: PizZip;
    try {
      zip = new PizZip(file.buffer);
    } catch {
      throw new BadRequestException('ZIP lampiran tidak dapat dibaca');
    }

    const entries = Object.entries(zip.files).filter(([entryName, entry]: [string, any]) => {
      const normalizedPath = entryName.replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || '';
      return (
        !entry.dir &&
        !normalizedPath.startsWith('__MACOSX/') &&
        fileName !== '.DS_Store' &&
        !fileName.startsWith('._')
      );
    });
    if (entries.length === 0) {
      throw new BadRequestException('ZIP tidak berisi file PDF');
    }
    if (entries.length > MAX_MASS_ATTACHMENT_FILES) {
      throw new BadRequestException(`Maksimal ${MAX_MASS_ATTACHMENT_FILES} PDF per ZIP`);
    }

    const files: SdeMasalAttachmentRef[] = [];
    const names = new Set<string>();
    let totalBytes = 0;
    let uploadedCount = 0;
    let reusedCount = 0;

    for (const [entryName, entry] of entries) {
      const fileName = this.normalizeMassAttachmentName(entryName);
      if (!fileName || fileName === '.' || fileName === '..' || entryName.includes('..')) {
        throw new BadRequestException(`Nama file ZIP tidak valid: ${entryName}`);
      }
      if (!/\.pdf$/i.test(fileName)) {
        throw new BadRequestException(`ZIP hanya boleh berisi PDF: ${fileName}`);
      }
      const normalizedName = fileName.toLowerCase();
      if (names.has(normalizedName)) {
        throw new BadRequestException(`Nama file PDF duplikat: ${fileName}`);
      }
      names.add(normalizedName);

      const buffer = entry.asNodeBuffer();
      if (buffer.length > MAX_MASS_ATTACHMENT_FILE_BYTES) {
        throw new BadRequestException(`Ukuran PDF maksimal 10MB: ${fileName}`);
      }
      totalBytes += buffer.length;
      if (totalBytes > MAX_MASS_ATTACHMENT_TOTAL_BYTES) {
        throw new BadRequestException('Total ukuran PDF dalam ZIP terlalu besar');
      }
      if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new BadRequestException(`Isi file bukan PDF yang valid: ${fileName}`);
      }

      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const key = `sde-masal/attachments/${sha256}.pdf`;
      const exists = await this.storageService.fileExists(key);
      if (exists) {
        reusedCount++;
      } else {
        await this.storageService.uploadBufferAtKey(buffer, key, 'application/pdf');
        uploadedCount++;
      }
      files.push({
        fileName,
        key,
        sha256,
        size: buffer.length,
        url: await this.storageService.getFileUrl(key),
      });
    }

    const matched: Record<string, SdeMasalAttachmentRef> = {};
    const requested = Array.from(
      new Set((requestedFileNames || []).map((name) => this.normalizeMassAttachmentName(name)).filter(Boolean)),
    );
    for (const requestedName of requested) {
      const found = files.find((candidate) => candidate.fileName.toLowerCase() === requestedName);
      if (found) matched[requestedName] = found;
    }

    return {
      files,
      matched,
      missing: requested.filter((name) => !matched[name]),
      uploadedCount,
      reusedCount,
    };
  }

  /**
   * Menulis mapping lampiran ke recipient_data dan field kompatibilitas
   * sde_masal.lampiran. Operasi ini idempotent sehingga aman dipanggil ulang.
   */
  async commitMassAttachments(
    folderId: string,
    payloadItems: Array<{ itemId: string; attachments: SdeMasalAttachmentRef[] }>,
    creatorPosition?: string | number,
  ): Promise<{ updated: number; files: number }> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    const isSigner = String(creatorPosition || '') === String(folder.pengirimId || '');
    const isCreator = String(creatorPosition || '') === String(folder.createdBy || '');
    if (!isSigner && !isCreator) {
      throw new ForbiddenException('Anda bukan pembuat atau penandatangan SDE Massal ini');
    }
    if (!Array.isArray(payloadItems) || payloadItems.length > 1000) {
      throw new BadRequestException('Mapping lampiran tidak valid');
    }

    const ids = payloadItems.map((item) => item?.itemId).filter(Boolean);
    const dbItems = ids.length
      ? await this.repo.find({ where: { id: In(ids), folderId } })
      : [];
    const byId = new Map(dbItems.map((item) => [item.id, item]));
    if (dbItems.length !== new Set(ids).size) {
      throw new BadRequestException('Sebagian item lampiran tidak ditemukan dalam folder');
    }

    let files = 0;
    for (const payload of payloadItems) {
      const item = byId.get(payload.itemId);
      if (!item || !Array.isArray(payload.attachments)) {
        throw new BadRequestException('Mapping lampiran tidak valid');
      }
      if (payload.attachments.length > MAX_MASS_ATTACHMENT_FILES) {
        throw new BadRequestException('Jumlah lampiran per mapping terlalu banyak');
      }

      const attachments = payload.attachments.map((attachment) => {
        const fileName = this.normalizeMassAttachmentName(attachment.fileName);
        const sha256 = String(attachment.sha256 || '').toLowerCase();
        const key = String(attachment.key || '');
        if (!/^[a-f0-9]{64}$/.test(sha256) || key !== `sde-masal/attachments/${sha256}.pdf` || !/\.pdf$/i.test(fileName)) {
          throw new BadRequestException(`Referensi lampiran tidak valid: ${attachment.fileName || key}`);
        }
        return {
          fileName,
          key,
          sha256,
          ...(Number.isFinite(attachment.size) ? { size: attachment.size } : {}),
        };
      });

      for (const attachment of attachments) {
        if (!(await this.storageService.fileExists(attachment.key))) {
          throw new BadRequestException(`File lampiran tidak ditemukan: ${attachment.fileName}`);
        }
      }
      const recipient = this.parseRecipientData(item);
      recipient.lampiran = attachments;
      item.recipientData = JSON.stringify(recipient);
      item.lampiran = JSON.stringify(attachments);
      files += attachments.length;
      await this.repo.save(item);
    }

    return { updated: payloadItems.length, files };
  }

  async finalizeDirect(
    folderId: string,
    penerimaList: any[],
    signOption: 'digsig' | 'qr_only' | 'ttd_basah',
    passphrase?: string,
    creatorPosition?: string | number,
    persnum?: number,
    itemIds?: string[],
  ): Promise<{ total: number; success: number; failed: number }> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(creatorPosition || '') !== String(folder.pengirimId || '')) {
      throw new ForbiddenException('Anda bukan penandatangan SDE Massal ini');
    }
    if (signOption === 'digsig' && !passphrase) {
      throw new BadRequestException(
        'Passphrase wajib untuk tanda tangan digital',
      );
    }

    folder.signOption = signOption;
    await this.folderRepo.save(folder);

    // Jika item sudah di-generate sebelumnya (punya id), pakai ulang agar
    // lampiran yang sudah diupload tidak hilang. Jika belum, generate baru.
    let items: SdeMasalEntity[] = [];
    if (itemIds && itemIds.length > 0) {
      items = await this.repo.find({ where: { id: In(itemIds) } });
    }
    if (items.length === 0) {
      const generated = await this.generateMassal({
        folderId,
        konsep: {},
        penerimaList,
        template: {},
      });
      items = generated.items;
    }

    let success = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await this.finalizeNaskah(
          item.id,
          signOption,
          passphrase,
          creatorPosition,
          persnum,
        );
        success++;
      } catch (error) {
        this.logger.error(
          `Finalisasi langsung gagal untuk item ${item.id}: ${error?.message || error}`,
        );
        failed++;
      }
    }

    await this.refreshFolderCounters(folderId);
    if (failed === 0 && success > 0) {
      folder.status = 'DIFINALISASI';
      folder.rejectionReason = null;
      await this.folderRepo.save(folder);
    }
    return { total: penerimaList.length, success, failed };
  }

  async sendFolderToSigner(folderId: string, creatorPosition?: string | number) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(folder.createdBy || '') !== String(creatorPosition || '')) {
      throw new ForbiddenException('Hanya konseptor yang dapat mengirim SDE Massal');
    }
    if (!folder.pengirimId) {
      throw new BadRequestException('Pengirim SDE Massal belum dipilih');
    }
    if (!['DRAFT', 'DIKEMBALIKAN'].includes(folder.status)) {
      if (folder.status === 'MENUNGGU_PENGIRIM') return folder;
      throw new BadRequestException('Folder tidak dapat dikirim pada status saat ini');
    }
    const items = await this.repo.find({ where: { folderId } });
    if (items.length === 0) throw new BadRequestException('Data penerima belum dibuat');
    folder.status = 'MENUNGGU_PENGIRIM';
    folder.rejectionReason = null;
    return this.folderRepo.save(folder);
  }

  async rejectFolder(
    folderId: string,
    signerPosition?: string | number,
    reason?: string,
  ) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(folder.pengirimId || '') !== String(signerPosition || '')) {
      throw new ForbiddenException('Hanya pengirim yang dapat menolak SDE Massal');
    }
    if (folder.status !== 'MENUNGGU_PENGIRIM') {
      throw new BadRequestException('Folder tidak sedang menunggu pengirim');
    }
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new BadRequestException('Alasan penolakan wajib diisi');
    folder.status = 'DIKEMBALIKAN';
    folder.rejectionReason = cleanReason;
    return this.folderRepo.save(folder);
  }

  // ============================================================
  // FOLDER QUERIES
  // ============================================================

  async findFolders(filter: any, positionId?: string) {
    const page = Math.max(Number(filter?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filter?.limit) || 12, 1), 100);
    const qb = this.folderRepo.createQueryBuilder('folder');
    if (filter?.search) {
      qb.andWhere(
        '(folder.judul LIKE :search OR folder.pengirim_name LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }
    if (filter?.status) {
      qb.andWhere('folder.status = :status', { status: filter.status });
    }
    if (filter?.klasifikasi) {
      qb.andWhere('folder.klasifikasi = :klasifikasi', {
        klasifikasi: filter.klasifikasi,
      });
    }
    if (filter?.tanggal) {
      qb.andWhere('folder.tanggal = :tanggal', { tanggal: filter.tanggal });
    }
    if (filter?.tahun) {
      qb.andWhere('YEAR(folder.tanggal) = :tahun', { tahun: filter.tahun });
    }
    // Scope per-akun: folder milik pengirim (position user), folder yang
    // dibuat user (created_by), ATAU folder dimana user adalah
    // penerima/tembusan di salah satu naskah.
    if (positionId) {
      if (filter?.createdByOnly) {
        qb.andWhere('folder.created_by = :positionId', { positionId });
      } else if (filter?.inboxOnly) {
        qb.andWhere(
          `folder.pengirim_id = :positionId AND folder.created_by IS NOT NULL AND folder.created_by <> :positionId`,
          { positionId },
        );
      } else {
        qb.andWhere(
        `(folder.pengirim_id = :positionId OR folder.created_by = :positionId OR EXISTS (
          SELECT 1 FROM sde_masal sm
          INNER JOIN naskah_sirkulasi ns ON ns.id_naskah = sm.naskah_id
          WHERE sm.folder_id = folder.id
          AND ns.position = :positionId
          AND ns.sirkuler IN ('penerima', 'tembusan')
          AND ns.is_draft = 0
        ))`,
        { positionId },
        );
      }
    }
    const [data, total] = await qb
      .orderBy('folder.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    // Resolve pembuat folder untuk tampilan inbox/terkirim. Pengirim folder
    // tetap disimpan sebagai penandatangan; baris inbox menampilkan konseptor.
    try {
      const org = await this.orgDataService.findLatestOrg();
      const rawPositions = org?.position_json;
      const parsedPositions = typeof rawPositions === 'string'
        ? JSON.parse(rawPositions)
        : rawPositions;
      const positions = Array.isArray(parsedPositions) ? parsedPositions : [];
      for (const folder of data) {
        const creator = positions.find(
          (position: any) => String(position.position) === String(folder.createdBy || ''),
        );
        (folder as any).createdByName = creator?.persnum_person_text || creator?.persnum_person || null;
        (folder as any).createdByPositionText = creator?.position_text || null;
      }
    } catch {
      // Metadata konseptor bersifat pelengkap; folder tetap dikembalikan.
    }
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findNaskahInFolder(
    folderId: string,
    positionId?: string,
    persnum?: string,
  ) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');

    try {
      const org = await this.orgDataService.findLatestOrg();
      const rawPositions = org?.position_json;
      const parsedPositions = typeof rawPositions === 'string'
        ? JSON.parse(rawPositions)
        : rawPositions;
      const positions = Array.isArray(parsedPositions) ? parsedPositions : [];
      const creator = positions.find(
        (position: any) => String(position.position) === String(folder.createdBy || ''),
      );
      (folder as any).createdByName = creator?.persnum_person_text || creator?.persnum_person || null;
      (folder as any).createdByPositionText = creator?.position_text || null;
    } catch {
      // Metadata konseptor bersifat pelengkap.
    }

    // Scope per-akun: pengirim folder, pembuat folder, verifikator, atau
    // penerima/tembusan.
    const isOwner =
      positionId &&
      (String(folder.pengirimId || '') === positionId ||
        String(folder.createdBy || '') === positionId);
    if (!isOwner) {
      // Cek apakah user adalah verifikator di salah satu item folder ini.
      const folderItems = await this.repo.find({ where: { folderId } });
      const isVerifikator = folderItems.some((item) =>
        (item.verifikators || []).some((v: any) => {
          const samePersnum = persnum && String(v.persnum) === String(persnum);
          const samePosition =
            positionId && String(v.position) === String(positionId);
          return samePersnum || samePosition;
        }),
      );

      // Cek apakah user adalah penerima/tembusan di naskah folder ini.
      const hasSirkulasi = positionId
        ? await this.sirkulasiRepository
            .createQueryBuilder('ns')
            .innerJoin('sde_masal', 'sm', 'sm.naskah_id = ns.id_naskah')
            .where('sm.folder_id = :folderId', { folderId })
            .andWhere('ns.position = :positionId', { positionId })
            .andWhere('ns.sirkuler IN (:...sirkuler)', {
              sirkuler: ['penerima', 'tembusan'],
            })
            .andWhere('ns.is_draft = 0')
            .getCount()
        : 0;

      if (!isVerifikator && hasSirkulasi === 0) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses ke folder SDE Massal ini',
        );
      }
    }

    const rows = await this.repo.find({
      where: { folderId },
      order: { createdAt: 'ASC' },
    });
    const naskahIds = rows
      .map((row) => row.naskahId)
      .filter(Boolean) as string[];
    const naskahList = naskahIds.length
      ? await this.naskahRepository.find({ where: { id: In(naskahIds) } })
      : [];
    const naskahMap = new Map(naskahList.map((naskah) => [naskah.id, naskah]));

    // Resolve nama penerima dari kode tertuju (batch lookup eksternal)
    const kodeSet = new Set<string>();
    for (const row of rows) {
      const recipient = this.parseRecipientData(row);
      const kode = String(recipient?.idTertuju || recipient?.tertuju || '')
        .trim()
        .replace(/^0+/, '');
      if (kode && kode.length < 36) kodeSet.add(kode.padStart(3, '0'));
    }
    const eksternalMap = new Map<string, string>();
    if (kodeSet.size > 0) {
      const externals = await this.eksternalRepository.find({
        where: { kode: In([...kodeSet]) },
      });
      for (const ext of externals) {
        const normalized = String(ext.kode || '').replace(/^0+/, '');
        eksternalMap.set(normalized, ext.nama);
      }
    }

    return {
      folder,
      items: rows.map((row) => {
        const recipient = this.parseRecipientData(row);
        const naskah = row.naskahId ? naskahMap.get(row.naskahId) : undefined;
        const rawKode = String(recipient?.idTertuju || recipient?.tertuju || '')
          .trim()
          .replace(/^0+/, '');
        const penerimaNama =
          (rawKode && eksternalMap.get(rawKode)) ||
          recipient?.tertuju ||
          rawKode ||
          '-';
        return {
          id: row.id,
          folderId: row.folderId,
          naskahId: row.naskahId,
          nomor: naskah?.nomor || null,
          perihal: naskah?.perihal || recipient?.perihal || '-',
          penerima: penerimaNama,
          recipient,
          emailTertuju:
            recipient?.emailTertuju || recipient?.email_tertuju || null,
          emailCc: recipient?.emailCc || recipient?.email_cc || null,
          emailBcc: recipient?.emailBcc || recipient?.email_bcc || null,
          status: naskah?.status || row.statusVerifikasi,
          statusVerifikasi: row.statusVerifikasi,
          verifikators: row.verifikators || [],
          submittedAt: row.submittedAt || null,
          finalPdf: naskah?.final_pdf || null,
          createdAt: row.createdAt,
        };
      }),
    };
  }

  // ============================================================
  // VERIFIKASI
  // ============================================================

  async submitVerification(
    ids: string[],
    verifikators: any[],
  ): Promise<{ total: number; items: SdeMasalEntity[] }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Data SDE Massal tidak ditemukan');
    }
    if (!Array.isArray(verifikators) || verifikators.length === 0) {
      throw new BadRequestException('Pilih minimal satu verifikator');
    }

    const rows = await this.repo.find({ where: { id: In(ids) } });
    if (rows.length === 0) {
      throw new NotFoundException('Data SDE Massal tidak ditemukan');
    }

    const verifierRows = this.normalizeVerifikators(verifikators);
    for (const item of rows) {
      item.verifikators = verifierRows;
      item.currentVerifikatorUrutan = 1;
      item.statusVerifikasi = 'MENUNGGU_VERIFIKASI';
      item.submittedAt = new Date();
      item.errorMessage = null;
    }

    const saved = await this.repo.save(rows);
    for (const folderId of new Set(
      saved.map((row) => row.folderId).filter(Boolean),
    )) {
      await this.refreshFolderCounters(folderId as string);
    }
    return { total: saved.length, items: saved };
  }

  async findVerificationForUser(user: any) {
    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();

    const rows = await this.repo
      .createQueryBuilder('s')
      .andWhere('s.status_verifikasi IN (:...statuses)', {
        statuses: ['MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK'],
      })
      .orderBy('s.submitted_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();

    // Hanya tampilkan item di mana user adalah verifikator.
    const filtered = rows.filter((item) =>
      (item.verifikators || []).some((verifikator: any) => {
        const samePersnum = persnum && String(verifikator.persnum) === persnum;
        const samePosition =
          position && String(verifikator.position) === position;
        return samePersnum || samePosition;
      }),
    );

    // Enrich dengan data folder + recipient untuk display
    const folderIds = [
      ...new Set(filtered.map((item) => item.folderId).filter(Boolean)),
    ] as string[];
    const folders = folderIds.length
      ? await this.folderRepo.find({ where: { id: In(folderIds) } })
      : [];
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    return filtered.map((item) => {
      const folder = item.folderId
        ? folderMap.get(item.folderId) || null
        : null;
      const recipient = this.parseRecipientData(item);
      return {
        ...item,
        folder,
        recipient,
        // Field turunan untuk kompatibilitas tampilan lama
        perihal: recipient?.perihal || '-',
        tertuju: recipient?.tertuju || recipient?.idTertuju || '-',
        klasifikasiName: folder
          ? [folder.klasifikasi, folder.klasifikasiText]
              .filter(Boolean)
              .join(' - ')
          : null,
        klasifikasiId: folder?.klasifikasi || null,
        pengirimName: folder?.pengirimName || null,
        tanggalKonsep: folder?.tanggal
          ? new Date(folder.tanggal).toISOString().slice(0, 10)
          : null,
      };
    });
  }

  /**
   * Daftar folder yang perlu diverifikasi oleh user (verifikator).
   * Mengelompokkan item sde_masal per folder, hanya folder yang punya
   * minimal satu item di mana user adalah verifikator (waiting/verified/rejected).
   */
  async findVerificationFoldersForUser(user: any) {
    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();

    const rows = await this.repo
      .createQueryBuilder('s')
      .andWhere('s.status_verifikasi IN (:...statuses)', {
        statuses: ['MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK'],
      })
      .getMany();

    // Filter item di mana user adalah verifikator (waiting/verified/rejected).
    const myItems = rows.filter((item) =>
      (item.verifikators || []).some((verifikator: any) => {
        const samePersnum = persnum && String(verifikator.persnum) === persnum;
        const samePosition =
          position && String(verifikator.position) === position;
        return samePersnum || samePosition;
      }),
    );

    // Kelompokkan per folder.
    const folderIds = [
      ...new Set(myItems.map((item) => item.folderId).filter(Boolean)),
    ] as string[];
    const folders = folderIds.length
      ? await this.folderRepo.find({ where: { id: In(folderIds) } })
      : [];
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    return folders.map((folder) => {
      const items = myItems.filter((item) => item.folderId === folder.id);
      const waitingCount = items.filter(
        (item) => item.statusVerifikasi === 'MENUNGGU_VERIFIKASI',
      ).length;
      return {
        ...folder,
        totalItems: items.length,
        waitingCount,
      };
    });
  }

  async approveVerification(id: string, user: any, catatan?: string | null) {
    return this.verifySdeMasal(id, user, 'approve', catatan);
  }

  async rejectVerification(id: string, user: any, catatan?: string | null) {
    return this.verifySdeMasal(id, user, 'reject', catatan);
  }

  private async verifySdeMasal(
    id: string,
    user: any,
    action: 'approve' | 'reject',
    catatan?: string | null,
  ) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Data SDE Massal tidak ditemukan');

    const verifikators = [
      ...(item.verifikators || []),
    ] as SdeMasalVerifikator[];
    if (verifikators.length === 0) {
      throw new BadRequestException('SDE Massal belum memiliki verifikator');
    }

    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();
    const current = verifikators.find((v) => v.status === 'waiting');
    if (!current)
      throw new BadRequestException('Tidak ada giliran verifikasi aktif');

    const isCurrentUser =
      (persnum && String(current.persnum) === persnum) ||
      (position && String(current.position) === position);
    if (!isCurrentUser) {
      throw new ForbiddenException(
        'Belum giliran Anda untuk memverifikasi SDE Massal ini',
      );
    }

    if (action === 'reject') {
      current.status = 'rejected';
      current.rejectedAt = new Date().toISOString();
      current.catatan = catatan || null;
      item.statusVerifikasi = 'DITOLAK';
      item.errorMessage = catatan || 'Ditolak verifikator';
      item.verifikators = verifikators;
      const rejected = await this.repo.save(item);
      if (item.folderId) await this.refreshFolderCounters(item.folderId);
      return rejected;
    }

    current.status = 'verified';
    current.verifiedAt = new Date().toISOString();
    current.catatan = catatan || null;

    const next = verifikators.find(
      (v) => v.urutan > current.urutan && v.status === 'pending',
    );
    if (next) {
      next.status = 'waiting';
      item.currentVerifikatorUrutan = next.urutan;
      item.statusVerifikasi = 'MENUNGGU_VERIFIKASI';
    } else {
      item.currentVerifikatorUrutan = verifikators.length;
      item.statusVerifikasi = 'TERVERIFIKASI';
      item.errorMessage = null;
    }

    item.verifikators = verifikators;
    const saved = await this.repo.save(item);

    // Auto-finalize memakai service SDE tunggal agar nomor, PDF, referensi,
    // sirkulasi, dan notifikasi mengikuti alur SDE standar.
    if (item.statusVerifikasi === 'TERVERIFIKASI' && !item.naskahId) {
      try {
        this.logger.log(
          `Auto-finalize naskah untuk SDE Masal ${item.id} setelah verifikasi selesai`,
        );
        const folder = item.folderId
          ? await this.folderRepo.findOne({ where: { id: item.folderId } })
          : null;
        // Passphrase tidak pernah disimpan di database. Jika folder meminta
        // BSrE setelah alur verifikator, gunakan QR-only agar tidak menyimpan
        // kredensial sensitif dan proses tetap dapat selesai otomatis.
        const finalSignOption =
          folder?.signOption === 'ttd_basah' ? 'ttd_basah' : 'qr_only';
        await this.finalizeNaskah(
          item.id,
          finalSignOption,
          undefined,
          position,
          user?.persnum ? Number(user.persnum) : undefined,
        );
      } catch (err) {
        this.logger.error(
          `Gagal auto-finalize naskah untuk SDE Masal ${item.id}: ${err?.message ?? err}`,
        );
      }
    }

    return saved;
  }

  // ============================================================
  // LIST & DETAIL
  // ============================================================

  /**
   * List SDE Masal dengan filter dan pagination.
   * Mengembalikan item dengan data folder + recipientData yang sudah di-parse.
   */
  async findAll(filter: SdeMasalFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('s');

    if (filter.search) {
      // Search berdasarkan recipientData (JSON text) karena perihal/tertuju
      // sekarang disimpan di recipientData.
      qb.andWhere('s.recipient_data LIKE :search', {
        search: `%${filter.search}%`,
      });
    }
    if (filter.statusVerifikasi) {
      qb.andWhere('s.status_verifikasi = :status', {
        status: filter.statusVerifikasi,
      });
    }
    if (filter.folderId) {
      qb.andWhere('s.folder_id = :folderId', { folderId: filter.folderId });
    }

    qb.orderBy('s.created_at', 'DESC');

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    // Enrich dengan data folder untuk display
    const folderIds = [
      ...new Set(data.map((item) => item.folderId).filter(Boolean)),
    ] as string[];
    const folders = folderIds.length
      ? await this.folderRepo.find({ where: { id: In(folderIds) } })
      : [];
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    return {
      data: data.map((item) => ({
        ...item,
        folder: item.folderId ? folderMap.get(item.folderId) || null : null,
        recipient: this.parseRecipientData(item),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<any | null> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) return null;
    const folder = item.folderId
      ? await this.folderRepo.findOne({ where: { id: item.folderId } })
      : null;
    return {
      ...item,
      folder,
      recipient: this.parseRecipientData(item),
    };
  }

  /**
   * Detail naskah SDE individual by naskahId.
   * Mengembalikan data naskah + sirkulasi (pengirim + penerima) untuk ditampilkan
   * di halaman detail surat.
   */
  /**
   * Label jenis TTD berdasarkan sign_option naskah.
   * Konsisten dengan NaskahService.getLabelTtd.
   */
  private getLabelTtd(signOption: string | null): string | null {
    if (signOption === 'digsig') return 'TTE BSrE';
    if (signOption === 'qr_only') return 'QR Code';
    if (signOption === 'ttd_basah') return 'TTD Basah';
    return null;
  }

  async findNaskahDetail(naskahId: string): Promise<any | null> {
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });
    if (!naskah) return null;

    const pengirimSirkulasi = await this.sirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    const tembusanList = await this.sirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'tembusan' },
      order: { urutan: 'ASC' },
    });

    const sdeMasalItem = await this.repo.findOne({
      where: { naskahId },
    });
    const folder = sdeMasalItem?.folderId
      ? await this.folderRepo.findOne({ where: { id: sdeMasalItem.folderId } })
      : null;

    // Fallback: jika sirkulasi penerima kosong (data lama), derive dari
    // recipient_data SDE Masal (kode tertuju dari Excel → tabel eksternal)
    let penerimaList = await this.sirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'penerima' },
      order: { urutan: 'ASC' },
    });
    if (penerimaList.length === 0 && sdeMasalItem) {
      const recipient = this.parseRecipientData(sdeMasalItem);
      const rawKode = String(recipient.idTertuju || recipient.tertuju || '')
        .trim()
        .replace(/^0+/, '');
      if (rawKode) {
        const external = await this.eksternalRepository.findOne({
          where: { kode: rawKode.padStart(3, '0') },
        });
        if (external) {
          penerimaList = [
            {
              id: external.id,
              namaSirkuler: external.nama,
              alamat: external.alamat || null,
              telepon: external.telepon || null,
              email: external.email || null,
              positionText: external.kontak || null,
              positionStatus: 'ext',
            } as any,
          ];
        }
      }
    }

    // URL PDF final yang bisa diakses (presigned URL dari MinIO)
    const finalPdfUrl = naskah.final_pdf
      ? await this.storageService.getFileUrl(naskah.final_pdf)
      : null;
    const attachmentRefs = sdeMasalItem
      ? this.getAttachmentRefs(sdeMasalItem, this.parseRecipientData(sdeMasalItem))
      : [];
    const lampiranFiles = await Promise.all(
      attachmentRefs.map(async (attachment) => ({
        file_name: attachment.fileName,
        file_pdf: attachment.key,
        url: await this.storageService.getFileUrl(attachment.key),
      })),
    );

    return {
      id: naskah.id,
      jenis: naskah.jenis,
      nomor: naskah.nomor,
      tanggal: naskah.tanggal,
      perihal: naskah.perihal,
      sifat: naskah.sifat,
      status: naskah.status,
      konten: naskah.konten,
      tempat: naskah.tempat,
      lampiran: naskah.lampiran,
      english: naskah.english,
      final_pdf: naskah.final_pdf,
      finalPdfUrl,
      lampiran_files: lampiranFiles,
      // Label jenis TTD: TTE BSrE (digsig), QR Code (qr_only), TTD Basah
      label_ttd: this.getLabelTtd(naskah.signOption),
      signOption: naskah.signOption,
      createdByPosition: naskah.createdByPosition,
      createdAt: naskah.createdAt,
      pengirim: pengirimSirkulasi
        ? {
            position: pengirimSirkulasi.position,
            positionText: pengirimSirkulasi.positionText,
            namaSirkuler: pengirimSirkulasi.namaSirkuler,
            areaText: pengirimSirkulasi.areaText,
            organizationText: pengirimSirkulasi.organizationText,
          }
        : null,
      penerima: penerimaList.map((p) => ({
        id: p.id,
        nama: p.namaSirkuler,
        jabatan: p.positionText,
        alamat: p.alamat,
        telepon: p.telepon,
        email: p.email,
        positionStatus: p.positionStatus,
      })),
      tembusan: tembusanList.map((t) => ({
        id: t.id,
        nama: t.namaSirkuler,
        jabatan: t.positionText,
        positionStatus: t.positionStatus,
      })),
      sdeMasal: sdeMasalItem
        ? {
            id: sdeMasalItem.id,
            folderId: sdeMasalItem.folderId,
            folderJudul: folder?.judul || null,
            statusVerifikasi: sdeMasalItem.statusVerifikasi,
            klasifikasiName: folder
              ? [folder.klasifikasi, folder.klasifikasiText]
                  .filter(Boolean)
                  .join(' - ')
              : null,
            parentNaskahId: folder?.parentNaskahId,
          }
        : null,
    };
  }

  // ============================================================
  // UPDATE / DELETE
  // ============================================================

  async update(
    id: string,
    dto: UpdateSdeMasalDto,
  ): Promise<SdeMasalEntity | null> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) return null;
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  // ============================================================
  // SUMMARY
  // ============================================================

  async getSummary() {
    const total = await this.repo.count();
    const menunggu = await this.repo.count({
      where: { statusVerifikasi: 'MENUNGGU' },
    });
    const terkirim = await this.repo.count({
      where: { statusVerifikasi: 'TERKIRIM' },
    });
    const terverifikasi = await this.repo.count({
      where: { statusVerifikasi: 'TERVERIFIKASI' },
    });
    const ditolak = await this.repo.count({
      where: { statusVerifikasi: 'DITOLAK' },
    });
    const gagal = await this.repo.count({
      where: { statusVerifikasi: 'GAGAL' },
    });
    return { total, menunggu, terkirim, terverifikasi, ditolak, gagal };
  }

  // ============================================================
  // EXCEL TEMPLATE GENERATOR
  // ============================================================

  /**
   * Generate template Excel untuk download.
   * Format: No | Perihal | id_tertuju | jumlah_tagihan_idr | jumlah_tagihan_usd |
   * nama_cro | email_cro | jabatan_signer | nama_signer | tembusan | is_revision
   * File .xlsx dengan 4 sheet: Data Penerima, Petunjuk Pengisian, Mapping Field,
   * Referensi ID Tertuju.
   */
  async generateTemplate(skemaTemplate?: string): Promise<Buffer> {
    const skema = (skemaTemplate || '').toUpperCase();
    const isKeuangan = skema === 'KEUANGAN' || skema === 'SDE-KEUANGAN';

    // Ambil data eksternal aktif untuk contoh id_tertuju dan sheet referensi
    const eksternalList = await this.eksternalRepository
      .createQueryBuilder('e')
      .select(['e.kode', 'e.nama', 'e.email'])
      .where('e.aktif = :aktif', { aktif: true })
      .orderBy('e.kode', 'ASC')
      .getMany();

    const contoh1 = eksternalList[0]?.kode || '112';
    const contoh2 = eksternalList[1]?.kode || '117';
    const contoh3 = eksternalList[2]?.kode || '119';

    let ws1: XLSX.WorkSheet;
    let ws2: XLSX.WorkSheet;
    let ws3: XLSX.WorkSheet;

    if (isKeuangan) {
      const dataSheet = [
        [
          'No',
          'Perihal',
          'id_tertuju',
          'jumlah_tagihan_idr',
          'jumlah_tagihan_usd',
          'nama_cro',
          'email_cro',
          'jabatan_signer',
          'nama_signer',
          'tembusan_internal',
          'tembusan_eksternal',
          'is_revision',
          'email_tertuju',
          'email_cc',
          'email_bcc',
        ],
        [
          1,
          'Pemberitahuan Tagihan PINP',
          contoh1,
          '15000000',
          '1000',
          'CRO Contoh',
          'cro@example.com',
          'Manager Keuangan',
          'Nama Signer',
          '',
          'Direktur Jenderal Perhubungan Udara;Ketua Dewan Pengawas Perum LPPNPI',
          0,
          'penerima@example.com',
          'cc@example.com',
          'bcc@example.com',
        ],
        [
          2,
          'Pemberitahuan Tagihan PINP',
          contoh2,
          '25000000',
          '1500',
          'CRO Contoh',
          'cro@example.com',
          'Manager Keuangan',
          'Nama Signer',
          '',
          'Direktur Jenderal Perhubungan Udara',
          0,
          'penerima@example.com',
          '',
          '',
        ],
        [
          3,
          'Pemberitahuan Tagihan PINP',
          contoh3,
          '5000000',
          '500',
          'CRO Contoh',
          'cro@example.com',
          'Manager Keuangan',
          'Nama Signer',
          '',
          '',
          1,
          '',
          '',
          '',
        ],
      ];

      ws1 = XLSX.utils.aoa_to_sheet(dataSheet);
      ws1['!cols'] = [
        { wch: 5 },
        { wch: 35 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 25 },
        { wch: 30 },
        { wch: 25 },
        { wch: 25 },
        { wch: 40 },
        { wch: 50 },
        { wch: 12 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
      ];
      // Format tembusan_internal (J) dan tembusan_eksternal (K) sebagai text
      // agar Excel tidak menggabungkan "119,117" menjadi 119117
      for (let r = 0; r <= dataSheet.length; r++) {
        const cellJ = ws1[`J${r + 1}`];
        const cellK = ws1[`K${r + 1}`];
        if (cellJ) cellJ.z = '@';
        if (cellK) cellK.z = '@';
      }

      const petunjukSheet = [
        [
          'Petunjuk Pengisian Template SDE Masal - Skema Keuangan (Tagihan PINP)',
        ],
        [''],
        [
          '1. Kolom "Perihal" WAJIB diisi. Default: "Pemberitahuan Tagihan PINP".',
        ],
        [
          '2. Kolom "id_tertuju" diisi dengan kode ID Tertuju dari sheet "Referensi ID Tertuju".',
        ],
        ['   Contoh: 112, 117, 119, dst.'],
        [
          '3. Kolom "jumlah_tagihan_idr" WAJIB diisi (angka tanpa titik/koma). Contoh: 15000000.',
        ],
        [
          '4. Kolom "jumlah_tagihan_usd" WAJIB diisi (angka tanpa titik/koma). Contoh: 1000.',
        ],
        [
          '5. Kolom "nama_cro" WAJIB diisi nama Customer Relationship Officer (CRO).',
        ],
        ['6. Kolom "email_cro" WAJIB diisi email CRO.'],
        ['7. Kolom "jabatan_signer" WAJIB diisi jabatan penandatangan surat.'],
        ['8. Kolom "nama_signer" WAJIB diisi nama penandatangan surat.'],
        [
          '9. Kolom "tembusan_internal" opsional. Isi dengan position ID internal (pisahkan dengan titik koma ; jika lebih dari satu).',
          ,
        ],
        [
          '10. Kolom "tembusan_eksternal" opsional. Isi dengan kode eksternal (pisahkan dengan titik koma ; jika lebih dari satu).',
          ,
        ],
        ['11. Kolom "is_revision" opsional (0 = bukan revisi, 1 = revisi).'],
        ['12. Kolom "email_tertuju" opsional. Email penerima utama surat.'],
        ['13. Kolom "email_cc" opsional. Email tembusan (carbon copy).'],
        [
          '14. Kolom "email_bcc" opsional. Email tembusan tersembunyi (blind carbon copy).',
        ],
        ['15. File upload harus format .xlsx atau .xls.'],
        ['16. Maksimal 1000 baris per upload.'],
        [''],
        ['Variabel dinamis yang bisa dipakai di konten surat:'],
        ['  {{perihal}}             → Perihal'],
        ['  {{id_tertuju}}          → ID Tertuju'],
        ['  {{jumlah_tagihan_idr}}  → Jumlah Tagihan IDR'],
        ['  {{jumlah_tagihan_usd}}  → Jumlah Tagihan USD'],
        ['  {{nama_cro}}            → Nama CRO'],
        ['  {{email_cro}}           → Email CRO'],
        ['  {{jabatan_signer}}      → Jabatan Signer'],
        ['  {{nama_signer}}         → Nama Signer'],
        ['  {{tembusan_internal}}  → Tembusan Internal'],
        ['  {{tembusan_eksternal}}  → Tembusan Eksternal'],
        ['  {{email_tertuju}}       → Email Tertuju'],
        ['  {{email_cc}}            → Email CC'],
        ['  {{email_bcc}}           → Email BCC'],
      ];

      ws2 = XLSX.utils.aoa_to_sheet(petunjukSheet);
      ws2['!cols'] = [{ wch: 75 }];

      const mappingSheet = [
        ['Kolom Excel', 'Variabel Konten', 'Tipe Data', 'Wajib'],
        ['No', '-', 'number', 'Tidak'],
        ['Perihal', '{{perihal}}', 'string', 'YA'],
        ['id_tertuju', '{{id_tertuju}}', 'string', 'YA'],
        ['jumlah_tagihan_idr', '{{jumlah_tagihan_idr}}', 'number', 'YA'],
        ['jumlah_tagihan_usd', '{{jumlah_tagihan_usd}}', 'number', 'YA'],
        ['nama_cro', '{{nama_cro}}', 'string', 'YA'],
        ['email_cro', '{{email_cro}}', 'string', 'YA'],
        ['jabatan_signer', '{{jabatan_signer}}', 'string', 'YA'],
        ['nama_signer', '{{nama_signer}}', 'string', 'YA'],
        ['tembusan_internal', '{{tembusan_internal}}', 'string', 'Tidak'],
        ['tembusan_eksternal', '{{tembusan_eksternal}}', 'string', 'Tidak'],
        ['is_revision', '-', 'number', 'Tidak'],
        ['email_tertuju', '{{email_tertuju}}', 'string', 'Tidak'],
        ['email_cc', '{{email_cc}}', 'string', 'Tidak'],
        ['email_bcc', '{{email_bcc}}', 'string', 'Tidak'],
      ];

      ws3 = XLSX.utils.aoa_to_sheet(mappingSheet);
      ws3['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 10 }];
    } else {
      const dataSheet = [
        [
          'No',
          'Perihal',
          'id_tertuju',
          'jumlah_lampiran',
          'jabatan_penerima',
          'alamat_penerima',
          'panggilan_penerima',
          'nominal_rupiah',
          'nominal_dolar',
          'nama_cro',
          'email_cro',
          'jabatan_signer',
          'nama_signer',
          'tembusan_internal',
          'tembusan_eksternal',
          'is_revision',
          'email_tertuju',
          'email_cc',
          'email_bcc',
        ],
        [
          1,
          'Pemberitahuan Tagihan PJNP',
          contoh1,
          '1 (lembar)',
          'Direktur Jenderal Perhubungan Udara',
          'Jakarta / Di tempat',
          'Bapak/Ibu',
          'Rp 15.000.000',
          '$ 1.000',
          'CRO Contoh',
          'cro@example.com',
          'Direktur Utama',
          'Nama Signer',
          '',
          'Direktur Jenderal Perhubungan Udara;Ketua Dewan Pengawas Perum LPPNPI',
          0,
          'penerima@example.com',
          'cc@example.com',
          'bcc@example.com',
        ],
        [
          2,
          'Pemberitahuan Tagihan PJNP',
          contoh2,
          '1 (lembar)',
          'Direktur Jenderal Perhubungan Udara',
          'Jakarta / Di tempat',
          'Bapak/Ibu',
          'Rp 25.000.000',
          '$ 1.500',
          'CRO Contoh',
          'cro@example.com',
          'Direktur Utama',
          'Nama Signer',
          '',
          'Direktur Jenderal Perhubungan Udara',
          0,
          'penerima@example.com',
          '',
          '',
        ],
        [
          3,
          'Pemberitahuan Tagihan PJNP',
          contoh3,
          '-',
          'Direktur Jenderal Perhubungan Udara',
          'Di tempat',
          'Bapak/Ibu',
          'Rp 5.000.000',
          '$ 500',
          'CRO Contoh',
          'cro@example.com',
          'Direktur Utama',
          'Nama Signer',
          '',
          '',
          1,
          '',
          '',
          '',
        ],
      ];

      ws1 = XLSX.utils.aoa_to_sheet(dataSheet);
      ws1['!cols'] = [
        { wch: 5 },
        { wch: 35 },
        { wch: 15 },
        { wch: 18 },
        { wch: 35 },
        { wch: 30 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 25 },
        { wch: 30 },
        { wch: 25 },
        { wch: 25 },
        { wch: 40 },
        { wch: 50 },
        { wch: 12 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
      ];
      // Format tembusan_internal (O) dan tembusan_eksternal (P) sebagai text
      // agar Excel tidak menggabungkan "119,117" menjadi 119117
      for (let r = 0; r <= dataSheet.length; r++) {
        const cellO = ws1[`O${r + 1}`];
        const cellP = ws1[`P${r + 1}`];
        if (cellO) cellO.z = '@';
        if (cellP) cellP.z = '@';
      }

      const petunjukSheet = [
        ['Petunjuk Pengisian Template SDE Masal - Skema Umum (Tagihan PJNP)'],
        [''],
        [
          '1. Kolom "Perihal" WAJIB diisi. Default: "Pemberitahuan Tagihan PJNP".',
        ],
        [
          '2. Kolom "id_tertuju" diisi dengan kode ID Tertuju dari sheet "Referensi ID Tertuju".',
        ],
        ['   Contoh: 112, 117, 119, dst.'],
        ['3. Kolom "jumlah_lampiran" opsional. Contoh: "1 (lembar)" atau "-".'],
        ['4. Kolom "jabatan_penerima" WAJIB diisi jabatan penerima surat.'],
        [
          '5. Kolom "alamat_penerima" WAJIB diisi alamat penerima atau "Di tempat".',
        ],
        ['6. Kolom "panggilan_penerima" opsional. Default: "Bapak/Ibu".'],
        [
          '7. Kolom "nominal_rupiah" WAJIB diisi nominal tagihan IDR. Contoh: "Rp 15.000.000".',
        ],
        [
          '8. Kolom "nominal_dolar" WAJIB diisi nominal tagihan USD. Contoh: "$ 1.000".',
        ],
        [
          '9. Kolom "nama_cro" WAJIB diisi nama Customer Relationship Officer (CRO).',
        ],
        ['10. Kolom "email_cro" WAJIB diisi email CRO.'],
        ['11. Kolom "jabatan_signer" WAJIB diisi jabatan penandatangan surat.'],
        ['12. Kolom "nama_signer" WAJIB diisi nama penandatangan surat.'],
        [
          '13. Kolom "tembusan_internal" opsional. Isi dengan position ID internal (pisahkan dengan titik koma ; jika lebih dari satu).',
          ,
        ],
        [
          '14. Kolom "tembusan_eksternal" opsional. Isi dengan kode eksternal (pisahkan dengan titik koma ; jika lebih dari satu).',
          ,
        ],
        ['15. Kolom "is_revision" opsional (0 = bukan revisi, 1 = revisi).'],
        ['16. Kolom "email_tertuju" opsional. Email penerima utama surat.'],
        ['17. Kolom "email_cc" opsional. Email tembusan (carbon copy).'],
        [
          '18. Kolom "email_bcc" opsional. Email tembusan tersembunyi (blind carbon copy).',
        ],
        ['19. File upload harus format .xlsx atau .xls.'],
        ['20. Maksimal 1000 baris per upload.'],
        [''],
        ['Variabel dinamis yang bisa dipakai di konten surat:'],
        ['  {{perihal}}            → Perihal'],
        ['  {{id_tertuju}}         → ID Tertuju'],
        ['  {{jumlah_lampiran}}    → Jumlah Lampiran'],
        ['  {{jabatan_penerima}}   → Jabatan Penerima'],
        ['  {{alamat_penerima}}    → Alamat Penerima'],
        ['  {{panggilan_penerima}} → Panggilan Penerima'],
        ['  {{nominal_rupiah}}     → Nominal Rupiah'],
        ['  {{nominal_dolar}}      → Nominal Dolar'],
        ['  {{nama_cro}}           → Nama CRO'],
        ['  {{email_cro}}          → Email CRO'],
        ['  {{jabatan_signer}}     → Jabatan Signer'],
        ['  {{nama_signer}}        → Nama Signer'],
        ['  {{tembusan_internal}}  → Tembusan Internal'],
        ['  {{tembusan_eksternal}}  → Tembusan Eksternal'],
        ['  {{email_tertuju}}      → Email Tertuju'],
        ['  {{email_cc}}           → Email CC'],
        ['  {{email_bcc}}          → Email BCC'],
      ];

      ws2 = XLSX.utils.aoa_to_sheet(petunjukSheet);
      ws2['!cols'] = [{ wch: 75 }];

      const mappingSheet = [
        ['Kolom Excel', 'Variabel Konten', 'Tipe Data', 'Wajib'],
        ['No', '-', 'number', 'Tidak'],
        ['Perihal', '{{perihal}}', 'string', 'YA'],
        ['id_tertuju', '{{id_tertuju}}', 'string', 'YA'],
        ['jumlah_lampiran', '{{jumlah_lampiran}}', 'string', 'Tidak'],
        ['jabatan_penerima', '{{jabatan_penerima}}', 'string', 'YA'],
        ['alamat_penerima', '{{alamat_penerima}}', 'string', 'YA'],
        ['panggilan_penerima', '{{panggilan_penerima}}', 'string', 'Tidak'],
        ['nominal_rupiah', '{{nominal_rupiah}}', 'string', 'YA'],
        ['nominal_dolar', '{{nominal_dolar}}', 'string', 'YA'],
        ['nama_cro', '{{nama_cro}}', 'string', 'YA'],
        ['email_cro', '{{email_cro}}', 'string', 'YA'],
        ['jabatan_signer', '{{jabatan_signer}}', 'string', 'YA'],
        ['nama_signer', '{{nama_signer}}', 'string', 'YA'],
        ['tembusan_internal', '{{tembusan_internal}}', 'string', 'Tidak'],
        ['tembusan_eksternal', '{{tembusan_eksternal}}', 'string', 'Tidak'],
        ['is_revision', '-', 'number', 'Tidak'],
        ['email_tertuju', '{{email_tertuju}}', 'string', 'Tidak'],
        ['email_cc', '{{email_cc}}', 'string', 'Tidak'],
        ['email_bcc', '{{email_bcc}}', 'string', 'Tidak'],
      ];

      ws3 = XLSX.utils.aoa_to_sheet(mappingSheet);
      ws3['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 10 }];
    }

    // Sheet 4: Referensi ID Tertuju (dari master data tertuju-eksternal)
    const refSheet: any[] = [
      ['ID Tertuju', 'Nama Penerima', 'Email'],
      ...eksternalList.map((e) => [e.kode, e.nama, e.email || '-']),
    ];

    const ws4 = XLSX.utils.aoa_to_sheet(refSheet);
    ws4['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Data Penerima');
    XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk Pengisian');
    XLSX.utils.book_append_sheet(wb, ws3, 'Mapping Field');
    XLSX.utils.book_append_sheet(wb, ws4, 'Referensi ID Tertuju');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private parseRecipientData(item: SdeMasalEntity): Record<string, any> {
    if (!item.recipientData) return {};
    try {
      return JSON.parse(item.recipientData);
    } catch {
      return {};
    }
  }

  private normalizeMassAttachmentName(value: unknown): string {
    const raw = String(value ?? '').replace(/\\/g, '/').trim();
    return raw.split('/').pop()?.trim() || '';
  }

  private getAttachmentRefs(
    item: SdeMasalEntity,
    recipient: Record<string, any>,
  ): SdeMasalAttachmentRef[] {
    const value = recipient.lampiran;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // String biasa adalah nama dari Excel, bukan object key storage.
      }
    }

    // Kompatibilitas upload per-item lama: key disimpan langsung di
    // sde_masal.lampiran, tanpa mengubah format data penerima.
    if (item.lampiran && /^sde-masal\/lampiran\//i.test(item.lampiran)) {
      return [
        {
          fileName: item.lampiran.split('/').pop() || 'lampiran.pdf',
          key: item.lampiran,
          sha256: '',
        },
      ];
    }
    return [];
  }

  private renderFolderKonten(
    folder: SdeMasalFolderEntity,
    item: SdeMasalEntity,
    recipient: Record<string, any>,
  ): string {
    const values = {
      ...(recipient.variables || {}),
      ...recipient,
      tertuju: recipient.tertuju || '',
      perihal: recipient.perihal || '',
      tembusan: recipient.tembusan || '',
      tembusan_internal:
        recipient.tembusanInternal || recipient.tembusan_internal || '',
      tembusan_eksternal:
        recipient.tembusanEksternal || recipient.tembusan_eksternal || '',
    };
    return (folder.kontenTemplate || '').replace(
      /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
      (match, key) =>
        ['nomor_surat', 'tanggal_surat', 'sifat_surat'].includes(key)
          ? match
          : String(values[key] ?? ''),
    );
  }

  /**
   * Resolve kode tembusan (dipisah , atau ;) menjadi list bernomor dengan nama.
   * Contoh: "112, 117" → "1. PT Angkasa Pura I\n2. PT Garuda Indonesia"
   */
  private async resolveTembusanList(
    folder: SdeMasalFolderEntity,
    recipient: Record<string, any>,
  ): Promise<string> {
    const raw = String(recipient.tembusan || '').trim();
    if (!raw) return '';
    const codes = raw
      .split(/[,;]/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0) return '';
    const lines: string[] = [];
    let no = 1;
    for (const code of codes) {
      const external = await this.eksternalRepository.findOne({
        where:
          code.length === 36 ? { id: code } : { kode: code.padStart(3, '0') },
      });
      const nama = external?.nama || code;
      lines.push(`${no}. ${nama}`);
      no++;
    }
    return lines.join('\n');
  }

  private async resolveRecipientExternal(
    folder: SdeMasalFolderEntity,
    item: SdeMasalEntity,
    recipient: Record<string, any>,
  ): Promise<EksternalEntity> {
    const rawId = String(recipient.idTertuju || '').trim();
    let external: EksternalEntity | null = null;
    if (rawId) {
      external = await this.eksternalRepository.findOne({
        where:
          rawId.length === 36
            ? { id: rawId }
            : { kode: rawId.padStart(3, '0') },
      });
    }
    // Fallback: idTertuju kosong tapi tertuju berisi kode → lookup by kode
    if (!external) {
      const rawKode = String(recipient.tertuju || '').trim();
      if (rawKode && rawKode.length < 36) {
        external = await this.eksternalRepository.findOne({
          where: { kode: rawKode.padStart(3, '0') },
        });
      }
    }
    if (external) return external;
    return this.findOrCreateEksternal({
      nama: recipient.tertuju || rawId || 'Penerima Eksternal',
      alamat: recipient.alamatPenerima || recipient.alamat || null,
      kota: recipient.kota || null,
      jabatanPenerima: recipient.jabatanPenerima || recipient.jabatan || null,
      createdByPosition: folder.pengirimId,
    });
  }

  private parseInternalTembusan(recipient: Record<string, any>): number[] {
    const value =
      recipient.tembusanInternal ||
      recipient.tembusan_internal ||
      recipient.internalTembusan;
    if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
    return String(value || '')
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
  }

  /**
   * Resolve tembusan_eksternal + tembusan_internal menjadi array nama
   * untuk preview PDF. Urutan: eksternal dulu, lalu internal.
   * - Eksternal: kode → nama dari tabel eksternal
   * - Internal: position ID → position_text dari org_data
   * Fallback: jika keduanya kosong, gunakan tembusan lama sebagai eksternal.
   */
  async resolveTembusanForPreview(
    tembusanEksternal: string,
    tembusanInternal: string,
    tanggal?: string,
    legacyTembusan?: string,
  ): Promise<string[]> {
    const result: string[] = [];

    // 0. Fallback: kolom tembusan lama dipakai sebagai eksternal bila kolom
    //    baru tidak diisi (kompatibel dengan data Excel lama).
    const extSource =
      String(tembusanEksternal || '') || String(legacyTembusan || '');

    // Pre-load org_data sekali (untuk resolve position ID internal).
    // Pakai findLatestOrg (fallback ke data terbaru) agar tidak throw
    // NotFoundException bila tanggal spesifik tidak ada.
    // PENTING: position_json bisa berupa string JSON (belum di-parse) —
    // harus di-parse dulu sebelum dipakai sebagai array.
    let positionJson: any[] = [];
    const parsePositionJson = (raw: unknown): any[] => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    try {
      const orgData = tanggal
        ? await this.orgDataService.findOrg(tanggal)
        : await this.orgDataService.findLatestOrg();
      positionJson = parsePositionJson(orgData?.position_json);
    } catch {
      try {
        const latest = await this.orgDataService.findLatestOrg();
        positionJson = parsePositionJson(latest?.position_json);
      } catch {
        /* org_data tidak tersedia → fallback tampilkan kode */
      }
    }

    // Helper: resolve position ID → position_text dari org_data
    const resolveInternal = (posId: string): string => {
      const pos = positionJson.find(
        (p) => String(p.position) === String(posId),
      );
      return pos?.position_text || pos?.persnum_person_text || posId;
    };

    // 1. Resolve tembusan eksternal (kode → nama).
    //    Jika kode tidak ditemukan di tabel eksternal, coba cari di
    //    org_data (mungkin itu position ID internal, bukan kode eksternal).
    const extCodes = extSource
      .split(/[,;]/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const code of extCodes) {
      const external = await this.eksternalRepository.findOne({
        where:
          code.length === 36 ? { id: code } : { kode: code.padStart(3, '0') },
      });
      if (external?.nama) {
        result.push(external.nama);
      } else {
        // Tidak ditemukan di eksternal → coba resolve sebagai internal
        result.push(resolveInternal(code));
      }
    }

    // 2. Resolve tembusan internal (position ID → position_text)
    const intPositions = String(tembusanInternal || '')
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const posId of intPositions) {
      result.push(resolveInternal(posId));
    }

    return result;
  }

  private async addExternalTembusan(
    naskahId: string,
    item: SdeMasalEntity,
    recipient: Record<string, any>,
    status: string,
  ): Promise<void> {
    const codes = String(
      recipient.tembusanEksternal || recipient.tembusan || '',
    )
      .split(/[,;]/)
      .map((code) => code.trim())
      .filter(Boolean);
    if (!codes.length) return;
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });
    let urutan = 2;
    for (const code of codes) {
      const external = await this.eksternalRepository.findOne({
        where:
          code.length === 36 ? { id: code } : { kode: code.padStart(3, '0') },
      });
      if (!external) continue;
      const row = this.sirkulasiRepository.create({
        id: uuidv4(),
        tanggal: naskah?.tanggal || new Date(),
        idNaskah: naskahId,
        sirkuler: 'tembusan',
        companyText: external.nama,
        organizationText: external.nama,
        positionStatus: 'ext',
        idSirkuler: external.id,
        namaSirkuler: external.nama,
        alamat: external.alamat || null,
        telepon: external.telepon || null,
        email: external.email || null,
        isDraft: status === 'pending',
        urutan: urutan++,
      });
      await this.sirkulasiRepository.save(row);
    }
  }

  /**
   * Tambah tembusan internal ke naskah_sirkulasi.
   * Dipanggil saat naskah terkirim (finalize) agar setiap akun internal
   * yang dijadikan tembusan menerima surat di kotak masuknya.
   * - sirkuler = 'tembusan', position_status = 'ybs' (bukan 'ext')
   * - position = position ID dari tembusan_internal (Excel)
   * - is_draft = false, is_konsep = 0 → langsung tampil di inbox
   */
  private async addInternalTembusan(
    naskahId: string,
    item: SdeMasalEntity,
    recipient: Record<string, any>,
    status: string,
  ): Promise<void> {
    const positions = String(
      recipient.tembusanInternal || recipient.tembusan_internal || '',
    )
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!positions.length) return;
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    // Pre-load org_data sekali untuk resolve position ID → jabatan
    let positionJson: any[] = [];
    const parsePositionJson = (raw: unknown): any[] => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    try {
      const latest = await this.orgDataService.findLatestOrg();
      positionJson = parsePositionJson(latest?.position_json);
    } catch {
      /* org_data tidak tersedia → fallback tampilkan kode */
    }

    let urutan = 100; // urutan tinggi agar tampil setelah tembusan eksternal
    for (const posId of positions) {
      const pos = positionJson.find(
        (p) => String(p.position) === String(posId),
      );
      const positionText = pos?.position_text || posId;
      // Catatan: is_konsep tidak di-set di sini — kolom DB punya default 0
      // (entity shared tidak mendeklarasikan field tersebut).
      const row = this.sirkulasiRepository.create({
        id: uuidv4(),
        tanggal: naskah?.tanggal || new Date(),
        idNaskah: naskahId,
        sirkuler: 'tembusan',
        company: pos?.company != null ? String(pos.company) : null,
        companyText: pos?.company_name || 'PERUM LPPNPI',
        area: pos?.area != null ? String(pos.area) : null,
        areaText: pos?.area_text || null,
        subArea: pos?.sub_area != null ? String(pos.sub_area) : null,
        subAreaText: pos?.sub_area_text || null,
        organization:
          pos?.organization_id != null ? String(pos.organization_id) : null,
        organizationText: pos?.organization_text || null,
        position: String(posId),
        positionText,
        positionStatus: 'ybs',
        idSirkuler: null,
        namaSirkuler: pos?.persnum_person_text || positionText,
        isDraft: status === 'pending',
        urutan: urutan++,
      });
      await this.sirkulasiRepository.save(row);
    }
  }

  private async refreshFolderCounters(folderId: string): Promise<void> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) return;
    const rows = await this.repo.find({ where: { folderId } });
    const totalItems = rows.length;
    const totalTerkirim = rows.filter(
      (row) => row.statusVerifikasi === 'TERKIRIM',
    ).length;
    const totalDitolak = rows.filter(
      (row) => row.statusVerifikasi === 'DITOLAK',
    ).length;
    folder.status =
      totalTerkirim === totalItems && totalItems > 0
        ? 'TERKIRIM'
        : totalDitolak === totalItems && totalItems > 0
          ? 'DITOLAK'
          : rows.some((row) => row.statusVerifikasi === 'MENUNGGU_VERIFIKASI')
            ? 'MENUNGGU_VERIFIKASI'
            : 'DRAFT';
    await this.folderRepo.save(folder);
  }

  private normalizeVerifikators(verifikators: any[]): SdeMasalVerifikator[] {
    return verifikators.slice(0, 3).map((item, index) => ({
      urutan: index + 1,
      persnum: String(item.persnum ?? item.persnumPerson ?? '').trim(),
      position: String(item.position ?? item.positionId ?? '').trim(),
      nama: item.nama || item.name || '-',
      jabatan: item.jabatan || item.positionText || '-',
      status: index === 0 ? 'waiting' : 'pending',
      verifiedAt: null,
      rejectedAt: null,
      catatan: null,
    }));
  }

  private async findOrCreateEksternal(data: {
    nama: string;
    alamat: string | null;
    kota: string | null;
    jabatanPenerima: string | null;
    createdByPosition: string | null;
  }): Promise<EksternalEntity> {
    const existing = await this.eksternalRepository
      .createQueryBuilder('e')
      .where('LOWER(e.nama) = LOWER(:nama)', { nama: data.nama })
      .andWhere('e.id_position_pembuat = :pos', {
        pos: data.createdByPosition || '',
      })
      .getOne();

    if (existing) {
      return existing;
    }

    const alamatLengkap = [data.alamat, data.kota].filter(Boolean).join(', ');

    const eksternal = new EksternalEntity();
    eksternal.id = uuidv4();
    eksternal.id_position_pembuat = data.createdByPosition || '';
    eksternal.company = String(COMPANY_ID);
    eksternal.area = '';
    eksternal.nama = data.nama;
    eksternal.alamat = alamatLengkap || '';
    eksternal.telepon = '';
    eksternal.email = '';
    eksternal.kontak = data.jabatanPenerima || '';
    eksternal.aktif = true;
    return this.eksternalRepository.save(eksternal);
  }
}
