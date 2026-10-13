import { portalCorrespondenceSignatureOptions } from '../../tte-portal/helpers/portal-correspondence-signature';
import { formatGmRecipientLabel } from '../../../common/helpers/gm-recipient-label.helper';
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
import PQueue from 'p-queue';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
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
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';
import {
  CreateSuratDinasEksternalDto,
  SignOption,
  SifatSurat,
} from '../../surat-dinas-eksternal/dto/create-surat-dinas-eksternal.dto';
import type { DigsigBatchContext } from '../../digsig/services/digsig.service';
import { TteSigningGateway } from '../../tte-portal/services/tte-signing-gateway.service';
import { TteSigningService } from '../../tte-portal/services/tte-signing.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

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
const RESERVED_NOMOR_KEY = '__sdeMasalReservedNomor';

// Batas file per proses paralel/bulk signing. Folder besar dipecah menjadi
// beberapa chunk supaya penggunaan memori, koneksi DB, dan payload tetap aman.
const SDE_MASAL_FINALIZE_BATCH_SIZE = 8;

// Generate dipanggil dari beberapa jalur wizard (watcher, autosave, dan
// tombol aksi). Serialisasi singkat ini mencegah dua request untuk folder yang
// sama sama-sama lolos pengecekan lalu melakukan insert ganda.
const sdeMasalGenerateQueue = new PQueue({
  concurrency: 1,
  throwOnTimeout: true,
});

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
  // Beberapa approval item dapat masuk bersamaan. Coalesce pengiriman
  // notifikasi yang sama agar race condition tidak membuat beberapa toast.
  private readonly sdeMasalNotificationInFlight = new Map<
    string,
    Promise<void>
  >();
  private readonly sdeMasalSendInFlight = new Map<string, Promise<any>>();

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
    private readonly notificationService: NotificationService,
    private readonly tteSigningGateway: TteSigningGateway,
    private readonly tteSigningService: TteSigningService,
  ) {}

  // ============================================================
  // FOLDER CRUD
  // ============================================================

  async createFolder(
    dto: CreateSdeMasalFolderDto,
    creatorPosition?: string | number,
  ): Promise<SdeMasalFolderEntity> {
    if (creatorPosition) {
      const positions = await this.getLatestOrgPositions();
      const creator = positions.find(
        (position) =>
          String(position?.position ?? '').trim() ===
          String(creatorPosition).trim(),
      );
      const creatorPositionText = String(
        creator?.position_text || '',
      ).toUpperCase();
      const isManagerial =
        this.getVerificationRoleRank(creatorPositionText) !== null ||
        /\bDIREKTUR\b|\bMANAGER\b|\bCHIEF\b/.test(creatorPositionText);

      // Staff hanya membuat SDE Massal dari tugas disposisi. Pejabat
      // managerial tetap dapat membuat dari flow SDE Massal biasa.
      if (!isManagerial) {
        const parent = dto.parentNaskahId
          ? await this.naskahRepository.findOne({
              where: { id: dto.parentNaskahId },
              select: ['id', 'jenis'],
            })
          : null;
        if (!parent || parent.jenis !== 'DI') {
          throw new ForbiddenException(
            'Staff hanya dapat membuat SDE Massal dari disposisi yang diterima',
          );
        }
      }
    }
    await this.assertDispositionAccess(dto.parentNaskahId, creatorPosition);
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
      recipientType: dto.recipientType || 'EXTERNAL',
      atasNama: dto.atasNama || null,
      atasNamaPositionId: dto.atasNamaPositionId || null,
      kontenTemplate: dto.kontenTemplate || null,
      dynamicVariables: dto.dynamicVariables || [],
      originalFileUrl: dto.originalFileUrl || null,
      signOption: dto.signOption || null,
      status: 'DRAFT',
      // Posisi dari token adalah sumber utama. Jangan bergantung pada
      // createdBy dari frontend agar notifikasi pengembalian selalu kembali
      // ke konseptor yang membuat folder.
      createdBy: creatorPosition
        ? String(creatorPosition)
        : dto.createdBy || null,
    });
    const saved = await this.folderRepo.save(entity);

    // SDE Massal merupakan tindak lanjut dari disposisi yang diterima oleh
    // pembuat folder, bukan oleh penandatangan akhir surat.
    if (saved.parentNaskahId && creatorPosition) {
      await this.sirkulasiRepository.update(
        {
          idNaskah: saved.parentNaskahId,
          position: String(creatorPosition),
          sirkuler: In(['penerima', 'tembusan']),
        },
        { tindakLanjut: 1 },
      );
    }

    return saved;
  }

  /**
   * SDE Massal yang dibuat dari disposisi harus tetap mengikuti akses
   * disposisi. Untuk parent berjenis DI, hanya posisi yang menerima
   * sirkulasi aktif yang boleh membuat folder. Parent naskah biasa tidak
   * dibatasi oleh aturan ini agar flow SDE Massal lama tetap kompatibel.
   */
  private async assertDispositionAccess(
    parentNaskahId?: string | null,
    creatorPosition?: string | number,
  ): Promise<void> {
    if (!parentNaskahId || !creatorPosition) return;

    const parent = await this.naskahRepository.findOne({
      where: { id: parentNaskahId },
      select: ['id', 'jenis'],
    });
    if (!parent || parent.jenis !== 'DI') return;

    const accessCount = await this.sirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .where('sirkulasi.id_naskah = :naskahId', { naskahId: parentNaskahId })
      .andWhere('sirkulasi.position = :position', {
        position: String(creatorPosition),
      })
      .andWhere('sirkulasi.sirkuler IN (:...sirkuler)', {
        sirkuler: ['penerima', 'tembusan'],
      })
      .andWhere('sirkulasi.is_draft = 0')
      .getCount();

    if (accessCount === 0) {
      throw new ForbiddenException(
        'Anda tidak memiliki disposisi aktif untuk membuat SDE Massal dari naskah ini',
      );
    }
  }

  async syncDispositionFollowUp(
    parentNaskahId: string,
    positionId?: string | number,
  ): Promise<{ marked: boolean }> {
    if (!parentNaskahId || !positionId) return { marked: false };

    const folder = await this.folderRepo.findOne({
      where: {
        parentNaskahId,
        createdBy: String(positionId),
      },
      select: ['id', 'parentNaskahId', 'createdBy'],
    });
    if (!folder) return { marked: false };

    await this.sirkulasiRepository.update(
      {
        idNaskah: parentNaskahId,
        position: String(positionId),
        sirkuler: In(['penerima', 'tembusan']),
      },
      { tindakLanjut: 1 },
    );
    return { marked: true };
  }

  async updateFolder(
    id: string,
    data: Partial<CreateSdeMasalFolderDto>,
    creatorPosition?: string | number,
  ): Promise<SdeMasalFolderEntity> {
    const folder = await this.folderRepo.findOne({ where: { id } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (
      creatorPosition &&
      String(folder.createdBy || '') !== String(creatorPosition || '')
    ) {
      throw new ForbiddenException(
        'Hanya konseptor folder yang dapat mengubahnya',
      );
    }
    // Folder yang pernah ditolak pengirim dapat sudah telanjur tersimpan
    // sebagai MENUNGGU_PENGIRIM/SEBAGIAN_TERKIRIM oleh sinkronisasi versi
    // lama. Catatan penolakan adalah penanda bahwa folder harus dipulihkan
    // ke konseptor sebelum dapat diedit kembali.
    if (
      String(folder.rejectionReason || '').trim() &&
      ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM'].includes(folder.status)
    ) {
      folder.status = 'DIKEMBALIKAN';
    }
    if (!['DRAFT', 'DIKEMBALIKAN'].includes(folder.status)) {
      throw new BadRequestException(
        'Folder tidak dapat diubah pada status saat ini',
      );
    }

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
    if (data.recipientType !== undefined)
      folder.recipientType = data.recipientType;
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
  async generateMassal(
    body: {
      folderId?: string;
      konsep?: any;
      penerimaList: any[];
      template?: any;
      createdBy?: string;
    },
    creatorPosition?: string | number,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    items: SdeMasalEntity[];
  }> {
    return sdeMasalGenerateQueue.add(() =>
      this.generateMassalLocked(body, creatorPosition),
    );
  }

  private async generateMassalLocked(
    body: {
      folderId?: string;
      konsep?: any;
      penerimaList: any[];
      template?: any;
      createdBy?: string;
    },
    creatorPosition?: string | number,
  ): Promise<{
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
    if (
      folder &&
      creatorPosition &&
      String(folder.createdBy || '') !== String(creatorPosition || '')
    ) {
      throw new ForbiddenException(
        'Hanya konseptor folder yang dapat mengubahnya',
      );
    }
    if (folder && !['DRAFT', 'DIKEMBALIKAN'].includes(folder.status)) {
      throw new BadRequestException(
        'Folder tidak dapat diubah pada status saat ini',
      );
    }

    const resolvedPenerimaList =
      folder?.recipientType === 'INTERNAL'
        ? await this.resolveInternalRecipients(penerimaList)
        : penerimaList;

    // Request ulang untuk folder yang sama harus idempotent. `no` adalah
    // identitas baris Excel; lampiran sengaja tidak dijadikan pembeda karena
    // formatnya berubah dari nama file menjadi object setelah upload/commit.
    const existingKeys = new Set<string>();
    const existingItemsByKey = new Map<string, SdeMasalEntity>();
    if (body.folderId) {
      const existingItems = await this.repo.find({
        where: { folderId: body.folderId },
      });
      existingItems.forEach((item) => {
        const key = this.getMassalRecipientKey(item.recipientData);
        existingKeys.add(key);
        existingItemsByKey.set(key, item);
      });
    }

    // Simpan template ke folder jika diberikan
    if (folder && body.template) {
      folder.kontenTemplate = body.template.konten || folder.kontenTemplate;
      folder.dynamicVariables = Array.from(
        new Set(
          resolvedPenerimaList.flatMap((item) =>
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
    const updatedItems: SdeMasalEntity[] = [];
    const requestedKeys: string[] = [];
    let failed = 0;

    for (const p of resolvedPenerimaList) {
      try {
        if (p.isValid === false) {
          failed++;
          continue;
        }
        const recipientKey = this.getMassalRecipientKey(p);
        if (existingKeys.has(recipientKey)) {
          const existing = existingItemsByKey.get(recipientKey);
          if (
            folder?.recipientType === 'INTERNAL' &&
            existing &&
            !existing.naskahId &&
            ['MENUNGGU', 'DITOLAK', 'GAGAL'].includes(
              existing.statusVerifikasi,
            )
          ) {
            existing.recipientData = JSON.stringify(
              this.normalizeMassalRecipient(p),
            );
            updatedItems.push(existing);
          }
          requestedKeys.push(recipientKey);
          continue;
        }
        existingKeys.add(recipientKey);
        requestedKeys.push(recipientKey);
        const normalizedRecipient = this.normalizeMassalRecipient(p);
        const item = this.repo.create({
          folderId: body.folderId || null,
          recipientData: JSON.stringify(normalizedRecipient),
          statusVerifikasi: 'MENUNGGU',
          createdBy: creatorPosition
            ? String(creatorPosition)
            : body.createdBy || null,
        });
        items.push(item);
      } catch (err) {
        this.logger.warn(`Failed to generate item: ${err?.message ?? err}`);
        failed++;
      }
    }

    let saved: SdeMasalEntity[] = [];
    if (items.length > 0 || updatedItems.length > 0) {
      saved = await this.repo.save([...items, ...updatedItems]);
    }
    const generatedItemsByKey = new Map(
      saved.map((item) => [this.getMassalRecipientKey(item.recipientData), item]),
    );
    const resultItems = requestedKeys
      .map((key) => existingItemsByKey.get(key) || generatedItemsByKey.get(key))
      .filter((item): item is SdeMasalEntity => Boolean(item));

    return {
      total: resolvedPenerimaList.length,
      success: resultItems.length,
      failed,
      // Kembalikan juga item yang sudah ada saat request diulang secara
      // idempotent agar frontend selalu mendapatkan ID database untuk submit.
      items: resultItems,
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
    syncFolder = true,
    bsreUserData?: { nik: string; no_wa: string },
    digsigBatch?: DigsigBatchContext,
    portalUser?: JwtPayload,
    deferPortalRequest = false,
  ): Promise<{
    naskahId: string;
    nomor: string;
    status: string;
    finalPdf?: string;
  }> {
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
        finalPdf: existing?.final_pdf || undefined,
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

    const recipient = this.normalizeMassalRecipient(
      this.parseRecipientData(item),
    );
    const attachmentRefs = this.getAttachmentRefs(item, recipient);
    const isInternalRecipient = folder.recipientType === 'INTERNAL';
    const external = isInternalRecipient
      ? null
      : await this.resolveRecipientExternal(folder, item, recipient);
    // Resolve tembusan eksternal ke list bernomor dengan nama eksternal
    const tembusanList = await this.resolveTembusanList(folder, {
      ...recipient,
      tembusan: recipient.tembusanEksternal || recipient.tembusan || '',
    });
    const internalTembusan = this.parseInternalTembusan(recipient);
    const authorityPositionId = Number(folder.atasNamaPositionId);
    if (
      Number.isFinite(authorityPositionId) &&
      authorityPositionId > 0 &&
      !internalTembusan.includes(authorityPositionId)
    ) {
      internalTembusan.push(authorityPositionId);
    }
    const konten = this.renderFolderKonten(folder, item, {
      ...recipient,
      tembusan:
        tembusanList || recipient.tembusanEksternal || recipient.tembusan || '',
      tembusan_internal: internalTembusan.join(';'),
      tembusan_eksternal: recipient.tembusanEksternal || '',
    });
    const normalizedSignOption = signOption || folder.signOption || 'qr_only';

    const dto: CreateSuratDinasEksternalDto = {
      pengirim: Number(folder.pengirimId),
      penerima: external ? [external.id] : [],
      penerima_display: isInternalRecipient
        ? [String(recipient.tertuju || recipient.employeeName || '')]
        : undefined,
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
          ? attachmentRefs.map((ref) => ({
              fileName: ref.fileName,
              key: ref.key,
            }))
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
      const reservedNomor = String(recipient[RESERVED_NOMOR_KEY] || '').trim();
      const response: any = await this.sdeService.sendMessage(
        dto,
        persnum,
        reservedNomor || undefined,
        bsreUserData,
        digsigBatch,
        portalUser,
        deferPortalRequest,
      );
      const data = response?.data;
      if (!data?.id)
        throw new Error('Layanan SDE tidak mengembalikan ID naskah');

      item.naskahId = data.id;
      item.statusVerifikasi = deferPortalRequest ? 'MENUNGGU_TTE' : 'TERKIRIM';
      item.errorMessage = null;
      await this.repo.save(item);
      // Penerima internal belum boleh melihat naskah di Kotak Masuk sebelum
      // konseptor menekan tombol kirim pada detail folder.
      if (isInternalRecipient) {
        await this.sirkulasiRepository.update(
          { idNaskah: data.id, sirkuler: 'pengirim' },
          { isDraft: true },
        );
      }
      await this.addExternalTembusan(data.id, item, recipient, data.status);
      // Tembusan internal sudah dibuat oleh alur SDE biasa melalui
      // dto.tembusan. Jangan insert ulang di sini karena menghasilkan dua
      // sirkulasi untuk position ID yang sama dan dua nama pada PDF/terkirim.
      if (syncFolder) await this.refreshFolderCounters(folder.id);

      // Repair folder lama: pembuat folder adalah pihak yang menindaklanjuti
      // disposisi, bukan pengirim akhir SDE Massal.
      if (syncFolder && folder.parentNaskahId && folder.createdBy) {
        await this.sirkulasiRepository.update(
          {
            idNaskah: folder.parentNaskahId,
            position: String(folder.createdBy),
            sirkuler: In(['penerima', 'tembusan']),
          },
          { tindakLanjut: 1 },
        );
      }

      return {
        naskahId: data.id,
        nomor: data.nomor || '',
        status: data.status || 'final',
        finalPdf: data.final_pdf,
      };
    } catch (error) {
      if (digsigBatch) {
        this.sdeService.skipMassalSigningParticipant(digsigBatch);
      }
      item.statusVerifikasi = 'GAGAL';
      item.errorMessage = String(error?.message || error).slice(0, 500);
      await this.repo.save(item);
      if (syncFolder) await this.refreshFolderCounters(folder.id);
      throw error;
    }
  }

  /** Buat sirkulasi penerima internal setelah konseptor menekan tombol kirim. */
  private async deliverInternalRecipient(
    folder: SdeMasalFolderEntity,
    item: SdeMasalEntity,
    recipient: Record<string, any>,
    senderPosition: any,
  ): Promise<{ status: 'sent' | 'skipped'; message: string }> {
    if (recipient.internalInboxSentAt) {
      return { status: 'skipped', message: 'Sudah dikirim ke Kotak Masuk' };
    }
    if (!item.naskahId) {
      throw new BadRequestException('Naskah belum selesai ditandatangani');
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: item.naskahId },
    });
    const naskahStatus = String(naskah?.status || '').toLowerCase();
    if (!naskah || !['final', 'final_tte'].includes(naskahStatus)) {
      throw new BadRequestException(
        'Naskah belum berstatus final; selesaikan penandatanganan terlebih dahulu.',
      );
    }

    // Revalidasi ID ketika dikirim; nama/jabatan dari file tidak menjadi sumber
    // otoritatif identitas maupun posisi penerima.
    const [resolved] = await this.resolveInternalRecipients([recipient]);
    const employeePositionId = String(resolved.employeePositionId);
    const existingCirculation = await this.sirkulasiRepository.findOne({
      where: {
        idNaskah: item.naskahId,
        position: employeePositionId,
        sirkuler: In(['penerima', 'tembusan']),
      },
      order: { urutan: 'ASC' },
    });

    let circulation = existingCirculation;
    let created = false;
    if (!circulation) {
      const allowedPositionStatus = new Set([
        'ybs',
        'pt',
        'ph',
        'ps',
        'se',
        'vi',
      ]);
      const rawPositionStatus = String(
        resolved.employeePositionStatus || 'ybs',
      ).toLowerCase();
      const positionStatus = allowedPositionStatus.has(rawPositionStatus)
        ? rawPositionStatus
        : 'ybs';
      const internalCirculationId = uuidv5(
        `sde-masal-internal:${item.naskahId}:${employeePositionId}`,
        uuidv5.URL,
      );
      circulation = this.sirkulasiRepository.create({
        id: internalCirculationId,
        tanggal: naskah.tanggal || new Date(),
        idNaskah: item.naskahId,
        sirkuler: 'penerima',
        company: resolved.employeeCompanyId || String(COMPANY_ID),
        companyText: resolved.employeeCompanyText || 'PERUM LPPNPI',
        area: resolved.employeeAreaId || null,
        areaText: resolved.employeeAreaText || null,
        subArea: resolved.employeeSubAreaId || null,
        subAreaText: resolved.employeeSubAreaText || null,
        organization: resolved.employeeOrganizationId || null,
        organizationText: resolved.employeeOrganizationText,
        position: employeePositionId,
        positionText: resolved.employeePositionText,
        positionStatus: positionStatus as any,
        idSirkuler: String(resolved.employeePersnum || resolved.employeeId),
        namaSirkuler: resolved.employeeName,
        email: resolved.employeeEmail || null,
        isDraft: false,
        urutan: 0,
      });
      try {
        await this.sirkulasiRepository.save(circulation);
        created = true;
      } catch (error: any) {
        // Deterministic ID protects against a retry from another app process.
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        circulation = await this.sirkulasiRepository.findOne({
          where: {
            idNaskah: item.naskahId,
            position: employeePositionId,
            sirkuler: 'penerima',
          },
        });
        if (!circulation) throw error;
      }
    } else if (circulation.isDraft) {
      circulation.isDraft = false;
      await this.sirkulasiRepository.save(circulation);
    }

    // Baru setelah dikirim, pengirim melihat naskah di daftar Terkirim.
    await this.sirkulasiRepository.update(
      { idNaskah: item.naskahId, sirkuler: 'pengirim' },
      { isDraft: false },
    );

    const updatedRecipient = {
      ...resolved,
      internalInboxSentAt: new Date().toISOString(),
    };
    delete updatedRecipient.internalInboxSendError;
    item.recipientData = JSON.stringify(updatedRecipient);
    await this.repo.save(item);

    // Baris tembusan yang sudah ada dipakai sebagai akses Inbox; jangan membuat
    // sirkulasi penerima kedua untuk posisi yang sama.
    if (created && circulation.sirkuler === 'penerima') {
      const rawPersnum = Number(
        resolved.employeePersnum || resolved.employeeId,
      );
      try {
        await this.notificationService.createNaskahMasukNotification({
          positionId: employeePositionId,
          userPersnum: Number.isFinite(rawPersnum) ? rawPersnum : undefined,
          naskahId: item.naskahId,
          sirkulasiId: circulation.id,
          jenis: 'SDE',
          nomor: naskah.nomor || undefined,
          perihal: naskah.perihal || recipient.perihal || '-',
          pengirim:
            senderPosition?.persnum_person_text ||
            senderPosition?.position_text ||
            folder.pengirimName ||
            'Pengirim SDE Massal',
          pengirimPosition:
            senderPosition?.position_text || folder.pengirimName || '-',
          isTembusan: false,
        });
      } catch (error) {
        // Inbox tetap bisa dibuka dari baris sirkulasi walau notifikasi gagal.
        this.logger.warn(
          `[SDE Masal] Notifikasi Kotak Masuk gagal untuk ${item.naskahId}: ${error?.message || error}`,
        );
      }
    }

    return {
      status: existingCirculation ? 'skipped' : 'sent',
      message: existingCirculation
        ? 'Penerima sudah memiliki akses Kotak Masuk; tidak dibuat duplikat'
        : 'Naskah berhasil dikirim ke Kotak Masuk karyawan internal',
    };
  }

  /** Kirim satu naskah SDE Massal melalui email. */
  private async sendEmailForItem(
    naskahId: string,
    recipient: Record<string, any>,
    external: EksternalEntity,
    pengirim: any,
    folder: SdeMasalFolderEntity,
    creatorPosition?: string | number,
    persnum?: number,
  ): Promise<boolean> {
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
      return false;
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
      return true;
    } catch (error) {
      this.logger.warn(
        `[SDE Masal] Gagal kirim email item ${naskahId} → ${to}: ${error?.message || error}`,
      );
      return false;
    }
  }

  /**
   * Kirim seluruh naskah yang sudah ditandatangani dari sisi konseptor.
   * Item yang berhasil dikirim ditandai di recipientData agar tombol dapat
   * dipakai ulang tanpa mengirim email yang sama dua kali.
   */
  async sendFolderEmails(
    folderId: string,
    creatorPosition?: string | number,
    requesterPersnum?: number,
    emailOverrides: Array<{
      itemId: string;
      to?: string;
      cc?: string;
      bcc?: string;
    }> = [],
  ) {
    const running = this.sdeMasalSendInFlight.get(folderId);
    if (running) return running;
    const request = this.sendFolderEmailsLocked(
      folderId,
      creatorPosition,
      requesterPersnum,
      emailOverrides,
    );
    this.sdeMasalSendInFlight.set(folderId, request);
    try {
      return await request;
    } finally {
      this.sdeMasalSendInFlight.delete(folderId);
    }
  }

  private async sendFolderEmailsLocked(
    folderId: string,
    creatorPosition?: string | number,
    requesterPersnum?: number,
    emailOverrides: Array<{
      itemId: string;
      to?: string;
      cc?: string;
      bcc?: string;
    }> = [],
  ) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(folder.createdBy || '') !== String(creatorPosition || '')) {
      throw new ForbiddenException('Hanya konseptor yang dapat mengirim naskah');
    }
    if (!['SIAP_KIRIM', 'TERKIRIM'].includes(folder.status)) {
      throw new BadRequestException(
        folder.recipientType === 'INTERNAL'
          ? 'Folder belum siap dikirim ke Kotak Masuk'
          : 'Folder belum siap dikirim melalui email',
      );
    }

    const rows = this.deduplicateMassalRows(
      await this.repo.find({ where: { folderId }, order: { createdAt: 'ASC' } }),
    ).filter((item) => item.naskahId && item.statusVerifikasi === 'TERKIRIM');
    if (rows.length === 0) {
      throw new BadRequestException('Belum ada naskah yang selesai ditandatangani');
    }

    const orgData = await this.orgDataService.findOrg(
      folder.tanggal
        ? new Date(folder.tanggal).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    );
    const pengirim = orgData?.position_json?.find(
      (position: any) => String(position.position) === String(folder.pengirimId || ''),
    );
    const senderPersnum = requesterPersnum ||
      (pengirim?.persnum_person ? Number(pengirim.persnum_person) : undefined);
    const overrideMap = new Map(
      emailOverrides.map((override) => [String(override.itemId), override]),
    );
    const results: Array<{
      itemId: string;
      naskahId: string;
      perihal: string;
      email: string;
      status: 'sent' | 'skipped' | 'failed';
      message?: string;
    }> = [];

    if (folder.recipientType === 'INTERNAL') {
      for (const item of rows) {
        const recipient = this.parseRecipientData(item);
        try {
          const result = await this.deliverInternalRecipient(
            folder,
            item,
            recipient,
            pengirim,
          );
          results.push({
            itemId: item.id,
            naskahId: item.naskahId!,
            perihal: recipient.perihal || '-',
            email: String(recipient.tertuju || recipient.employeeName || ''),
            status: result.status,
            message: result.message,
          });
        } catch (error) {
          const message = String(error?.message || error).slice(0, 300);
          recipient.internalInboxSendError = message;
          item.recipientData = JSON.stringify(recipient);
          await this.repo.save(item);
          results.push({
            itemId: item.id,
            naskahId: item.naskahId!,
            perihal: recipient.perihal || '-',
            email: String(recipient.tertuju || recipient.employeeName || ''),
            status: 'failed',
            message,
          });
        }
      }

      const allDelivered = results.every(
        (result) => result.status === 'sent' || result.status === 'skipped',
      );
      if (allDelivered) {
        folder.status = 'TERKIRIM';
        folder.rejectionReason = null;
        await this.folderRepo.save(folder);
        if (folder.parentNaskahId && folder.createdBy) {
          await this.sirkulasiRepository.update(
            {
              idNaskah: folder.parentNaskahId,
              position: String(folder.createdBy),
              sirkuler: In(['penerima', 'tembusan']),
            },
            { tindakLanjut: 1 },
          );
        }
        await this.notifySdeMasalPositions([folder.createdBy], {
          title: 'SDE Massal Selesai Dikirim',
          body: `Folder "${folder.judul || '-'}" berhasil dikirim ke Kotak Masuk karyawan internal.`,
          action: 'OPEN_SDE_MASAL_FOLDER',
          folderId: folder.id,
          status: 'TERKIRIM',
        });
      }

      return {
        deliveryType: 'INTERNAL' as const,
        folderStatus: allDelivered ? 'TERKIRIM' : 'SIAP_KIRIM',
        total: results.length,
        sent: results.filter((result) => result.status === 'sent').length,
        skipped: results.filter((result) => result.status === 'skipped').length,
        failed: results.filter((result) => result.status === 'failed').length,
        results,
      };
    }

    for (const item of rows) {
      const recipient = this.parseRecipientData(item);
      const override = overrideMap.get(item.id);
      if (override) {
        recipient.emailTertuju = String(override.to || '').trim();
        recipient.emailCc = String(override.cc || '').trim();
        recipient.emailBcc = String(override.bcc || '').trim();
      }
      const emailSentAt = String(recipient.emailSentAt || '').trim();
      const to = String(recipient.emailTertuju || recipient.email_tertuju || '').trim();
      const external = await this.resolveRecipientExternal(folder, item, recipient);
      const resolvedEmail = to || external.email || '';

      if (emailSentAt) {
        results.push({
          itemId: item.id,
          naskahId: item.naskahId!,
          perihal: recipient.perihal || '-',
          email: resolvedEmail,
          status: 'skipped',
          message: 'Email sudah pernah dikirim',
        });
        continue;
      }

      const sent = await this.sendEmailForItem(
        item.naskahId!,
        recipient,
        external,
        pengirim,
        folder,
        folder.pengirimId || creatorPosition,
        senderPersnum,
      );
      recipient.emailSendError = sent ? undefined : 'Email gagal dikirim';
      if (sent) {
        recipient.emailSentAt = new Date().toISOString();
        delete recipient.emailSendError;
      }
      item.recipientData = JSON.stringify(recipient);
      await this.repo.save(item);
      results.push({
        itemId: item.id,
        naskahId: item.naskahId!,
        perihal: recipient.perihal || '-',
        email: resolvedEmail,
        status: sent ? 'sent' : 'failed',
        message: sent ? 'Email berhasil dikirim' : 'Email gagal dikirim',
      });
    }

    const allSent = results.every((result) =>
      result.status === 'sent' || result.status === 'skipped',
    );
    if (allSent) {
      folder.status = 'TERKIRIM';
      folder.rejectionReason = null;
      await this.folderRepo.save(folder);
      if (folder.parentNaskahId && folder.createdBy) {
        await this.sirkulasiRepository.update(
          {
            idNaskah: folder.parentNaskahId,
            position: String(folder.createdBy),
            sirkuler: In(['penerima', 'tembusan']),
          },
          { tindakLanjut: 1 },
        );
      }
      await this.notifySdeMasalPositions([folder.createdBy], {
        title: 'SDE Massal Selesai Dikirim',
        body: `Folder "${folder.judul || '-'}" berhasil dikirim melalui email.`,
        action: 'OPEN_SDE_MASAL_FOLDER',
        folderId: folder.id,
        status: 'TERKIRIM',
      });
    }

    return {
      deliveryType: 'EXTERNAL' as const,
      folderStatus: allSent ? 'TERKIRIM' : 'SIAP_KIRIM',
      total: results.length,
      sent: results.filter((result) => result.status === 'sent').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    };
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
    if (!['SEBAGIAN_TERKIRIM', 'MENUNGGU_PENGIRIM'].includes(folder.status)) {
      throw new BadRequestException(
        'Folder belum berada pada tahap pengiriman',
      );
    }
    if (item.statusVerifikasi !== 'GAGAL') {
      throw new BadRequestException(
        'Hanya naskah yang gagal yang dapat dikirim ulang',
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
    if (!attachment?.key)
      throw new NotFoundException('Lampiran tidak ditemukan');
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
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    const isSigner =
      String(creatorPosition || '') === String(folder.pengirimId || '');
    const isCreator =
      String(creatorPosition || '') === String(folder.createdBy || '');
    if (!isSigner && !isCreator) {
      throw new ForbiddenException(
        'Anda bukan pembuat atau penandatangan SDE Massal ini',
      );
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

    const entries = Object.entries(zip.files).filter(
      ([entryName, entry]: [string, any]) => {
        const normalizedPath = entryName.replace(/\\/g, '/');
        const fileName = normalizedPath.split('/').pop() || '';
        return (
          !entry.dir &&
          !normalizedPath.startsWith('__MACOSX/') &&
          fileName !== '.DS_Store' &&
          !fileName.startsWith('._')
        );
      },
    );
    if (entries.length === 0) {
      throw new BadRequestException('ZIP tidak berisi file PDF');
    }
    if (entries.length > MAX_MASS_ATTACHMENT_FILES) {
      throw new BadRequestException(
        `Maksimal ${MAX_MASS_ATTACHMENT_FILES} PDF per ZIP`,
      );
    }

    const files: SdeMasalAttachmentRef[] = [];
    const names = new Set<string>();
    let totalBytes = 0;
    let uploadedCount = 0;
    let reusedCount = 0;

    for (const [entryName, entry] of entries) {
      const fileName = this.normalizeMassAttachmentName(entryName);
      if (
        !fileName ||
        fileName === '.' ||
        fileName === '..' ||
        entryName.includes('..')
      ) {
        throw new BadRequestException(
          `Nama file ZIP tidak valid: ${entryName}`,
        );
      }
      if (!/\.pdf$/i.test(fileName)) {
        throw new BadRequestException(
          `ZIP hanya boleh berisi PDF: ${fileName}`,
        );
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
        throw new BadRequestException(
          'Total ukuran PDF dalam ZIP terlalu besar',
        );
      }
      if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new BadRequestException(
          `Isi file bukan PDF yang valid: ${fileName}`,
        );
      }

      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const key = `sde-masal/attachments/${sha256}.pdf`;
      const exists = await this.storageService.fileExists(key);
      if (exists) {
        reusedCount++;
      } else {
        await this.storageService.uploadBufferAtKey(
          buffer,
          key,
          'application/pdf',
        );
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
      new Set(
        (requestedFileNames || [])
          .map((name) => this.normalizeMassAttachmentName(name))
          .filter(Boolean),
      ),
    );
    for (const requestedName of requested) {
      const found = files.find(
        (candidate) => candidate.fileName.toLowerCase() === requestedName,
      );
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
    payloadItems: Array<{
      itemId: string;
      attachments: SdeMasalAttachmentRef[];
    }>,
    creatorPosition?: string | number,
  ): Promise<{ updated: number; files: number }> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    const isSigner =
      String(creatorPosition || '') === String(folder.pengirimId || '');
    const isCreator =
      String(creatorPosition || '') === String(folder.createdBy || '');
    if (!isSigner && !isCreator) {
      throw new ForbiddenException(
        'Anda bukan pembuat atau penandatangan SDE Massal ini',
      );
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
      throw new BadRequestException(
        'Sebagian item lampiran tidak ditemukan dalam folder',
      );
    }

    let files = 0;
    for (const payload of payloadItems) {
      const item = byId.get(payload.itemId);
      if (!item || !Array.isArray(payload.attachments)) {
        throw new BadRequestException('Mapping lampiran tidak valid');
      }
      if (payload.attachments.length > MAX_MASS_ATTACHMENT_FILES) {
        throw new BadRequestException(
          'Jumlah lampiran per mapping terlalu banyak',
        );
      }

      const attachments = payload.attachments.map((attachment) => {
        const fileName = this.normalizeMassAttachmentName(attachment.fileName);
        const sha256 = String(attachment.sha256 || '').toLowerCase();
        const key = String(attachment.key || '');
        if (
          !/^[a-f0-9]{64}$/.test(sha256) ||
          key !== `sde-masal/attachments/${sha256}.pdf` ||
          !/\.pdf$/i.test(fileName)
        ) {
          throw new BadRequestException(
            `Referensi lampiran tidak valid: ${attachment.fileName || key}`,
          );
        }
        return {
          fileName,
          key,
          sha256,
          ...(Number.isFinite(attachment.size)
            ? { size: attachment.size }
            : {}),
        };
      });

      for (const attachment of attachments) {
        if (!(await this.storageService.fileExists(attachment.key))) {
          throw new BadRequestException(
            `File lampiran tidak ditemukan: ${attachment.fileName}`,
          );
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
    portalUser?: JwtPayload,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
    tte_redirect?: { transactionId: string; signingUrl: string };
  }> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(creatorPosition || '') !== String(folder.pengirimId || '')) {
      throw new ForbiddenException('Anda bukan penandatangan SDE Massal ini');
    }
    if (!['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM'].includes(folder.status)) {
      throw new BadRequestException('Folder belum siap dikirim oleh pengirim');
    }
    const isPortalMode =
      signOption === 'digsig' &&
      (await this.tteSigningGateway.isPortalMode('SDE'));
    if (signOption === 'digsig' && !isPortalMode && !passphrase) {
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
      items = await this.repo.find({ where: { id: In(itemIds), folderId } });
    } else {
      items = await this.repo.find({ where: { folderId } });
    }
    if (items.length === 0) {
      throw new BadRequestException(
        'Tidak ada surat yang dipilih untuk dikirim',
      );
    }

    const eligibleItems = items.filter(
      (item) =>
        ['TERVERIFIKASI', 'GAGAL'].includes(item.statusVerifikasi) &&
        (!item.naskahId || (isPortalMode && item.statusVerifikasi === 'GAGAL')),
    );
    if (eligibleItems.length === 0) {
      throw new BadRequestException(
        'Tidak ada surat yang sudah disetujui dan siap dikirim',
      );
    }
    if (isPortalMode && eligibleItems.length > 20) {
      throw new BadRequestException(
        'Portal TTE mendukung maksimal 20 dokumen per batch. Pilih maksimal 20 surat.',
      );
    }
    if (isPortalMode && !portalUser?.persnum) {
      throw new BadRequestException(
        'Identitas pengguna tidak tersedia untuk Portal TTE',
      );
    }

    // Nomor surat harus dialokasikan lebih dulu dalam transaksi singkat. Jika
    // lock nomor ikut ditahan selama PDF/BSrE, proses paralel akan saling
    // menunggu dan sebagian item dapat gagal karena lock timeout.
    const tanggal = folder.tanggal
      ? new Date(folder.tanggal).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const itemsWithoutReservedNumber = eligibleItems.filter((item) => {
      const recipient = this.parseRecipientData(item);
      return !String(recipient[RESERVED_NOMOR_KEY] || '').trim();
    });
    if (itemsWithoutReservedNumber.length > 0) {
      const reservedNumbers = await this.sdeService.reserveMassalNumbers(
        itemsWithoutReservedNumber.map((item) => {
          const recipient = this.parseRecipientData(item);
          return {
            pengirim: Number(folder.pengirimId),
            tgl: tanggal,
            klasifikasi: folder.klasifikasi || '',
            perihal: recipient.perihal || '-',
          };
        }),
      );
      itemsWithoutReservedNumber.forEach((item, index) => {
        const recipient = this.parseRecipientData(item);
        recipient[RESERVED_NOMOR_KEY] = reservedNumbers[index];
        item.recipientData = JSON.stringify(recipient);
      });
      await this.repo.save(itemsWithoutReservedNumber);
    }

    // Seluruh naskah dalam satu batch ditandatangani oleh user yang sama.
    // Ambil NIK/no. WA sekali agar batch besar tidak memanggil HR API berulang.
    const bsreUserData =
      signOption === 'digsig' && !isPortalMode && persnum
        ? await this.sdeService.getBsreUserDataForMassal(persnum)
        : undefined;

    // Jalankan alur SDE biasa untuk tiap naskah secara paralel dalam satu
    // request finalisasi. Endpoint BSrE /api/v2/sign/pdf terbukti mengembalikan
    // HTTP 500 ketika beberapa PDF dikirim dalam satu payload, sedangkan satu
    // PDF per request adalah alur yang stabil pada SDE biasa.
    const results: PromiseSettledResult<{
      naskahId: string;
      nomor: string;
      status: string;
    }>[] = [];
    for (
      let offset = 0;
      offset < eligibleItems.length;
      offset += SDE_MASAL_FINALIZE_BATCH_SIZE
    ) {
      const chunk = eligibleItems.slice(
        offset,
        offset + SDE_MASAL_FINALIZE_BATCH_SIZE,
      );

      const chunkResults = await Promise.allSettled(
        chunk.map((item) =>
          this.finalizeNaskah(
            item.id,
            signOption,
            passphrase,
            creatorPosition,
            persnum,
            false,
            bsreUserData,
            undefined,
            portalUser,
            isPortalMode,
          ),
        ),
      );
      results.push(...chunkResults);
    }

    let success = 0;
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success++;
        return;
      }

      const item = eligibleItems[index];
      this.logger.error(
        `Finalisasi langsung gagal untuk item ${item.id}: ${result.reason?.message || result.reason}`,
      );
      failed++;
    });

    let tteRedirect: { transactionId: string; signingUrl: string } | undefined;
    if (isPortalMode && success > 0) {
      const successful = results
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<{
            naskahId: string;
            nomor: string;
            status: string;
            finalPdf?: string;
          }> => result.status === 'fulfilled',
        )
        .map((result) => result.value);
      if (successful.some((result) => !result.finalPdf)) {
        throw new BadRequestException(
          'Sebagian PDF SDE Massal belum tersedia untuk Portal TTE',
        );
      }
      const documents = successful.map((result) => ({
        sourceKey: result.finalPdf!,
        filename:
          result.finalPdf!.split('/').pop() || `SDE-${result.naskahId}.pdf`,
        pathDokumen: 'surat-dinas-eksternal/digsig/',
        idNaskah: result.naskahId,
        jenisNaskah: 'SDE_MASAL',
        nomorNaskah: result.nomor,
        location: portalUser?.areaText || 'Indonesia',
        reason: `Penandatanganan SDE Massal ${folder.judul || folder.id}`,
        ...portalCorrespondenceSignatureOptions('SDE'),
      }));
      try {
        const portal =
          documents.length === 1
            ? await this.tteSigningService.createSigningTransaction({
                ...documents[0],
                user: portalUser!,
              })
            : await this.tteSigningService.createSigningBatch({
                documents,
                user: portalUser!,
              });
        tteRedirect = {
          transactionId: portal.transactionId,
          signingUrl: portal.signingUrl,
        };
        for (let index = 0; index < results.length; index++) {
          if (results[index].status === 'fulfilled') {
            eligibleItems[index].statusVerifikasi = 'MENUNGGU_TTE';
            eligibleItems[index].errorMessage = null;
          }
        }
        await this.repo.save(eligibleItems);
      } catch (error) {
        for (let index = 0; index < results.length; index++) {
          if (results[index].status === 'fulfilled') {
            eligibleItems[index].statusVerifikasi = 'GAGAL';
            eligibleItems[index].errorMessage = String(
              error instanceof Error ? error.message : error,
            ).slice(0, 500);
          }
        }
        await this.repo.save(eligibleItems);
        throw error;
      }
    }

    await this.refreshFolderCounters(folderId);
    if (tteRedirect) {
      await this.folderRepo.update(folder.id, {
        status: 'MENUNGGU_TTE',
        rejectionReason: null,
      });
    }
    if (success > 0 && !isPortalMode) {
      // Update hanya kolom alasan. Menyimpan objek `folder` yang dibaca sebelum
      // finalisasi akan menimpa status hasil refreshFolderCounters.
      await this.folderRepo.update(
        { id: folder.id },
        { rejectionReason: null },
      );
      const updatedFolder = await this.folderRepo.findOne({ where: { id: folder.id } });
      if (updatedFolder?.status === 'SIAP_KIRIM') {
        await this.notifySdeMasalPositions([folder.createdBy], {
          title: 'SDE Massal Siap Dikirim',
          body: `Folder "${folder.judul || '-'}" sudah ditandatangani dan siap dikirim melalui email.`,
          action: 'OPEN_SDE_MASAL_FOLDER',
          folderId: folder.id,
          status: 'SIAP_KIRIM',
        });
      }
    }
    return {
      total: eligibleItems.length,
      success,
      failed,
      skipped: items.length - eligibleItems.length,
      tte_redirect: tteRedirect,
    };
  }

  async completePortalItem(naskahId: string): Promise<void> {
    const item = await this.repo.findOne({ where: { naskahId } });
    if (!item || item.statusVerifikasi === 'TERKIRIM') return;
    item.statusVerifikasi = 'TERKIRIM';
    item.errorMessage = null;
    await this.repo.save(item);
    if (!item.folderId) return;

    const folder = await this.folderRepo.findOne({
      where: { id: item.folderId },
    });
    if (!folder) return;
    await this.refreshFolderCounters(item.folderId);
    const completedFolder = await this.folderRepo.findOne({
      where: { id: item.folderId },
    });
    if (!completedFolder || !['SIAP_KIRIM', 'TERKIRIM'].includes(completedFolder.status)) return;
    await this.notifySdeMasalPositions([completedFolder.createdBy], {
      title: 'SDE Massal Siap Dikirim',
      body: `Folder "${completedFolder.judul || '-'}" sudah ditandatangani melalui Portal TTE dan siap dikirim melalui email.`,
      action: 'OPEN_SDE_MASAL_FOLDER',
      folderId: completedFolder.id,
      status: 'SIAP_KIRIM',
    });
  }

  async failPortalItem(naskahId: string, message: string): Promise<void> {
    const item = await this.repo.findOne({ where: { naskahId } });
    if (!item || item.statusVerifikasi === 'TERKIRIM') return;
    item.statusVerifikasi = 'GAGAL';
    item.errorMessage = message.slice(0, 500);
    await this.repo.save(item);
    if (item.folderId) await this.refreshFolderCounters(item.folderId);
  }

  async sendFolderToSigner(
    folderId: string,
    creatorPosition?: string | number,
  ) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(folder.createdBy || '') !== String(creatorPosition || '')) {
      throw new ForbiddenException(
        'Hanya konseptor yang dapat mengirim SDE Massal',
      );
    }
    if (!folder.pengirimId) {
      throw new BadRequestException('Pengirim SDE Massal belum dipilih');
    }
    if (
      String(folder.rejectionReason || '').trim() &&
      ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM'].includes(folder.status)
    ) {
      folder.status = 'DIKEMBALIKAN';
    }
    if (folder.status === 'MENUNGGU_PENGIRIM') return folder;
    if (!['DRAFT', 'DIKEMBALIKAN'].includes(folder.status)) {
      throw new BadRequestException(
        'Folder tidak dapat dikirim pada status saat ini',
      );
    }
    const items = this.deduplicateMassalRows(
      await this.repo.find({ where: { folderId } }),
    );
    if (items.length === 0)
      throw new BadRequestException('Data penerima belum dibuat');
    if (!items.every((item) => item.statusVerifikasi === 'TERVERIFIKASI')) {
      throw new BadRequestException(
        'Folder harus menyelesaikan verifikasi terlebih dahulu',
      );
    }
    folder.status = 'MENUNGGU_PENGIRIM';
    folder.rejectionReason = null;
    const saved = await this.folderRepo.save(folder);
    await this.notifySdeMasalPositions([saved.pengirimId], {
      title: 'SDE Massal Menunggu Pengirim',
      body: `Folder "${saved.judul || '-'}" sudah diverifikasi dan menunggu difinalisasi.`,
      action: 'OPEN_SDE_MASAL_FOLDER',
      folderId: saved.id,
      status: saved.status,
    });
    return saved;
  }

  async rejectFolder(
    folderId: string,
    signerPosition?: string | number,
    reason?: string,
  ) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (String(folder.pengirimId || '') !== String(signerPosition || '')) {
      throw new ForbiddenException(
        'Hanya pengirim yang dapat menolak SDE Massal',
      );
    }
    if (!['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM'].includes(folder.status)) {
      throw new BadRequestException('Folder tidak sedang menunggu pengirim');
    }
    const cleanReason = String(reason || '').trim();
    if (!cleanReason)
      throw new BadRequestException('Alasan penolakan wajib diisi');
    const creatorPosition = await this.resolveSdeMasalCreatorPosition(folder);
    folder.status = 'DIKEMBALIKAN';
    folder.rejectionReason = cleanReason;
    const saved = await this.folderRepo.save(folder);
    await this.notifySdeMasalPositions([creatorPosition || saved.createdBy], {
      title: 'SDE Massal Dikembalikan',
      body: `Folder "${saved.judul || '-'}" dikembalikan oleh pengirim. Catatan: ${cleanReason}`,
      action: 'OPEN_SDE_MASAL_FOLDER',
      folderId: saved.id,
      status: saved.status,
      reason: cleanReason,
    });
    return saved;
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
    // Scope per-akun. Pengajuan hanya boleh meminta scope creator; sender
    // adalah scope terpisah agar folder tidak bocor ke halaman pengajuan.
    if (positionId) {
      const scope = String(filter?.scope || 'creator').toLowerCase();
      if (scope === 'sender') {
        qb.andWhere(
          'folder.pengirim_id = :positionId AND folder.status IN (:...senderStatuses)',
          {
            positionId,
            senderStatuses: ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM'],
          },
        );
      } else if (
        scope === 'creator' ||
        filter?.createdByOnly === true ||
        filter?.createdByOnly === 'true'
      ) {
        qb.andWhere('folder.created_by = :positionId', { positionId });
      } else {
        qb.andWhere('folder.created_by = :positionId', { positionId });
      }
    }
    const [data, total] = await qb
      .orderBy('folder.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    // Resolve pembuat folder untuk tampilan inbox/terkirim. Pengirim folder
    // tetap disimpan sebagai penandatangan; baris inbox menampilkan konseptor.
    try {
      const org = await this.orgDataService.findLatestOrg();
      const rawPositions = org?.position_json;
      const parsedPositions =
        typeof rawPositions === 'string'
          ? JSON.parse(rawPositions)
          : rawPositions;
      const positions = Array.isArray(parsedPositions) ? parsedPositions : [];
      for (const folder of data) {
        const creator = positions.find(
          (position: any) =>
            String(position.position) === String(folder.createdBy || ''),
        );
        (folder as any).createdByName =
          creator?.persnum_person_text || creator?.persnum_person || null;
        (folder as any).createdByPositionText = creator?.position_text || null;
        if (
          ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM', 'SIAP_KIRIM', 'TERKIRIM'].includes(
            folder.status,
          )
        ) {
          const finalSender = positions.find(
            (position: any) =>
              String(position.position) === String(folder.pengirimId || ''),
          );
          (folder as any).finalSenderName = finalSender
            ? this.formatPositionName(finalSender)
            : null;
        }
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
    let folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');

    // Selaraskan status folder dengan status item setiap kali detail dibuka.
    // Ini juga memperbaiki folder lama yang seluruh naskahnya sudah terkirim
    // tetapi status foldernya masih tersimpan sebagai tahap pengirim.
    await this.refreshFolderCounters(folderId);
    folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');

    try {
      const org = await this.orgDataService.findLatestOrg();
      const rawPositions = org?.position_json;
      const parsedPositions =
        typeof rawPositions === 'string'
          ? JSON.parse(rawPositions)
          : rawPositions;
      const positions = Array.isArray(parsedPositions) ? parsedPositions : [];
      const creator = positions.find(
        (position: any) =>
          String(position.position) === String(folder.createdBy || ''),
      );
      (folder as any).createdByName =
        creator?.persnum_person_text || creator?.persnum_person || null;
      (folder as any).createdByPositionText = creator?.position_text || null;
      if (
        ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM', 'SIAP_KIRIM', 'TERKIRIM'].includes(
          folder.status,
        )
      ) {
        const finalSender = positions.find(
          (position: any) =>
            String(position.position) === String(folder.pengirimId || ''),
        );
        (folder as any).finalSenderName = finalSender
          ? this.formatPositionName(finalSender)
          : null;
      }
    } catch {
      // Metadata konseptor bersifat pelengkap.
    }

    // Scope per-akun: konseptor selalu dapat membuka folder miliknya. Pengirim
    // hanya dapat membuka folder saat tugas pengirim aktif atau sudah sebagian
    // dikirim. Verifikator hanya dapat membuka folder yang sedang ditugaskan.
    const isCreator =
      !!positionId && String(folder.createdBy || '') === String(positionId);
    const isSender =
      !!positionId &&
      String(folder.pengirimId || '') === String(positionId) &&
      ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM', 'SIAP_KIRIM', 'TERKIRIM'].includes(
        folder.status,
      );
    const isOwner = isCreator || isSender;
    if (!isOwner) {
      // Cek apakah user adalah verifikator di salah satu item folder ini.
      const folderItems = await this.repo.find({ where: { folderId } });
      const isVerifikator = folderItems.some((item) =>
        (item.verifikators || []).some((v: any) => {
          const samePersnum = persnum && String(v.persnum) === String(persnum);
          const samePosition =
            positionId && String(v.position) === String(positionId);
          return (
            (samePersnum || samePosition) &&
            ['waiting', 'verified', 'rejected'].includes(v.status)
          );
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

    const rows = this.deduplicateMassalRows(
      await this.repo.find({
        where: { folderId },
        order: { createdAt: 'ASC' },
      }),
    );
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
          // Status alur SDE Massal menjadi sumber utama setelah pengiriman.
          // Jangan biarkan status internal naskah (mis. `final`) menimpa
          // label bisnis `Selesai` di daftar folder.
          status:
            row.statusVerifikasi === 'TERKIRIM'
              ? 'TERKIRIM'
              : naskah?.status || row.statusVerifikasi,
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
    creatorPosition?: string | number,
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
    const folderIds = new Set(rows.map((row) => row.folderId).filter(Boolean));
    if (folderIds.size !== 1 || rows.some((row) => !row.folderId)) {
      throw new BadRequestException(
        'Data verifikasi harus berasal dari satu folder',
      );
    }
    const folder = await this.folderRepo.findOne({
      where: { id: rows[0].folderId as string },
    });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (
      creatorPosition &&
      String(folder.createdBy || '') !== String(creatorPosition || '')
    ) {
      throw new ForbiddenException(
        'Hanya konseptor folder yang dapat mengajukan verifikasi',
      );
    }
    if (!['DRAFT', 'DIKEMBALIKAN'].includes(folder.status)) {
      throw new BadRequestException(
        'Folder sudah berada dalam proses verifikasi atau pengiriman',
      );
    }

    // Jangan mempercayai nama/jabatan dari payload frontend. Cocokkan
    // position/persnum ke snapshot organisasi lalu gunakan label master
    // untuk menentukan jenjang dan menyimpan snapshot verifikator.
    const positions = await this.getLatestOrgPositions();
    const selectedSender = positions.find(
      (position) =>
        String(position?.position ?? '').trim() ===
        String(folder.pengirimId ?? '').trim(),
    );
    const selectedSenderRank = this.getVerificationRoleRank(
      selectedSender?.position_text,
    );
    const resolvedVerifikators = verifikators
      .map((item) => {
        const positionId = String(
          item?.position ?? item?.positionId ?? '',
        ).trim();
        const persnum = String(
          item?.persnum ?? item?.persnumPerson ?? '',
        ).trim();
        const master = positions.find(
          (position) =>
            (positionId &&
              String(position?.position ?? '').trim() === positionId) ||
            (persnum &&
              String(position?.persnum_person ?? '').trim() === persnum),
        );
        return master
          ? {
              persnum: String(master.persnum_person ?? '').trim(),
              position: String(master.position ?? '').trim(),
              nama: master.persnum_person_text || master.nama || '-',
              jabatan: master.position_text || '-',
            }
          : { ...item, jabatan: '' };
      })
      .filter((item) => {
        const verifierPosition = String(
          item?.position ?? item?.positionId ?? '',
        ).trim();
        const verifierRank = this.getVerificationRoleRank(
          item?.jabatan || item?.positionText,
        );

        // Pengirim yang dipilih pada konsep tetap menjadi verifikator terakhir,
        // kemudian menerima folder kembali sebagai penandatangan/final sender.
        // Pejabat lain pada level yang sama atau lebih tinggi berada di luar
        // batas chain disposisi dan tidak boleh ikut tersimpan.
        if (verifierPosition === String(folder.pengirimId ?? '').trim()) {
          return true;
        }
        return (
          selectedSenderRank === null ||
          verifierRank === null ||
          verifierRank < selectedSenderRank
        );
      });
    if (resolvedVerifikators.length === 0) {
      throw new BadRequestException(
        'Chain verifikator tidak valid terhadap pengirim SDE Massal yang dipilih',
      );
    }
    // Verifikator berasal dari chain disposisi. Jangan membatasi hanya pada
    // BOD karena chain yang valid dapat berisi AVP, VP, EVP, maupun Direksi.
    // Pengirim konsep tetap dipindahkan ke langkah terakhir di bawah.
    // Pengirim konsep selalu menjadi langkah verifikasi terakhir.
    const senderPosition = String(folder.pengirimId ?? '').trim();
    const senderIndex = resolvedVerifikators.findIndex(
      (item) =>
        String(item?.position ?? item?.positionId ?? '').trim() ===
        senderPosition,
    );
    if (senderIndex >= 0 && senderIndex < resolvedVerifikators.length - 1) {
      const [sender] = resolvedVerifikators.splice(senderIndex, 1);
      resolvedVerifikators.push(sender);
    }
    const verifierRows = this.normalizeVerifikators(resolvedVerifikators);
    for (const item of rows) {
      item.verifikators = verifierRows;
      item.currentVerifikatorUrutan = 1;
      item.statusVerifikasi = 'MENUNGGU_VERIFIKASI';
      item.submittedAt = new Date();
      item.errorMessage = null;
    }

    const saved = await this.repo.save(rows);
    folder.status = 'MENUNGGU_VERIFIKASI';
    folder.rejectionReason = null;
    await this.folderRepo.save(folder);
    for (const folderId of new Set(
      saved.map((row) => row.folderId).filter(Boolean),
    )) {
      await this.refreshFolderCounters(folderId as string);
    }
    await this.notifySdeMasalPositions(
      verifierRows
        .filter((item) => item.status === 'waiting')
        .map((item) => item.position),
      {
        title: 'SDE Massal Menunggu Verifikasi',
        body: `Folder "${folder.judul || '-'}" menunggu verifikasi Anda.`,
        action: 'OPEN_SDE_MASAL_VERIFIKASI',
        folderId: folder.id,
        status: 'MENUNGGU_VERIFIKASI',
      },
    );
    return { total: saved.length, items: saved };
  }

  async findVerificationForUser(user: any) {
    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();

    const rows = await this.repo
      .createQueryBuilder('s')
      .andWhere('s.status_verifikasi = :status', {
        status: 'MENUNGGU_VERIFIKASI',
      })
      .orderBy('s.submitted_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();

    // Hanya tampilkan item yang sedang menunggu giliran user. Riwayat
    // verifikasi tetap tersimpan di item/folder, tetapi tidak menjadi tugas
    // aktif lagi setelah user menyetujui atau menolak.
    const filtered = rows.filter((item) =>
      (item.verifikators || []).some((verifikator: any) => {
        const samePersnum = persnum && String(verifikator.persnum) === persnum;
        const samePosition =
          position && String(verifikator.position) === position;
        return (
          (samePersnum || samePosition) && verifikator.status === 'waiting'
        );
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
   * minimal satu item di mana user sedang menjadi verifikator aktif (waiting).
   * Folder berpindah ke daftar verifikator berikutnya setelah approve.
   */
  async findVerificationFoldersForUser(user: any) {
    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();

    // Ambil seluruh item agar riwayat keputusan verifikator tetap terlihat
    // setelah status waiting berubah menjadi verified/rejected.
    const rows = await this.repo.createQueryBuilder('s').getMany();

    // Tampilkan tugas aktif sekaligus riwayat keputusan user pada folder.
    const myItems = rows.filter((item) =>
      (item.verifikators || []).some((verifikator: any) => {
        const samePersnum = persnum && String(verifikator.persnum) === persnum;
        const samePosition =
          position && String(verifikator.position) === position;
        return (
          (samePersnum || samePosition) &&
          ['waiting', 'verified', 'rejected'].includes(verifikator.status)
        );
      }),
    );

    // Kelompokkan per folder.
    const verifierFolderIds = [
      ...new Set(myItems.map((item) => item.folderId).filter(Boolean)),
    ] as string[];

    // Direktur Utama menerima tugas akhir di halaman yang sama setelah level
    // verifikasi terakhir selesai. Ia bukan verifikator tambahan: detail
    // folder akan menampilkan aksi preview + kirim sebagai pengirim akhir.
    const senderFolders = position
      ? await this.folderRepo.find({
          where: {
            pengirimId: position,
            status: In(['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM']),
          },
          order: { updatedAt: 'DESC' },
        })
      : [];
    const folderIds = [
      ...new Set([
        ...verifierFolderIds,
        ...senderFolders.map((folder) => folder.id),
      ]),
    ];
    const folders = folderIds.length
      ? await this.folderRepo.find({
          where: { id: In(folderIds) },
          order: { updatedAt: 'DESC' },
        })
      : [];
    const allItems = folderIds.length
      ? await this.repo.find({ where: { folderId: In(folderIds) } })
      : [];

    return folders.map((folder) => {
      const items = allItems.filter((item) => item.folderId === folder.id);
      const assignedItems = myItems.filter(
        (item) =>
          item.folderId === folder.id &&
          (item.verifikators || []).some((verifikator: any) => {
            const samePersnum =
              persnum && String(verifikator.persnum) === persnum;
            const samePosition =
              position && String(verifikator.position) === position;
            return (
              (samePersnum || samePosition) && verifikator.status === 'waiting'
            );
          }),
      );
      const myVerificationStatuses = items
        .flatMap((item) => item.verifikators || [])
        .filter((verifikator: any) => {
          const samePersnum =
            persnum && String(verifikator.persnum) === persnum;
          const samePosition =
            position && String(verifikator.position) === position;
          return samePersnum || samePosition;
        });
      const hasWaiting = myVerificationStatuses.some(
        (v: any) => v.status === 'waiting',
      );
      const hasRejected = myVerificationStatuses.some(
        (v: any) => v.status === 'rejected',
      );
      const myVerificationStatus =
        folder.status === 'TERKIRIM'
          ? 'TERKIRIM'
          : hasWaiting
            ? 'MENUNGGU_VERIFIKASI'
            : hasRejected
              ? 'DITOLAK'
              : myVerificationStatuses.some((v: any) => v.status === 'verified')
                ? 'TERVERIFIKASI'
                : null;
      const isFinalSender =
        String(folder.pengirimId || '') === position &&
        ['MENUNGGU_PENGIRIM', 'SEBAGIAN_TERKIRIM'].includes(folder.status);
      const waitingCount = isFinalSender
        ? items.filter(
            (item) =>
              ['TERVERIFIKASI', 'GAGAL'].includes(item.statusVerifikasi) &&
              !item.naskahId,
          ).length
        : assignedItems.length;
      return {
        ...folder,
        totalItems: items.length,
        waitingCount,
        workflowRole: isFinalSender ? 'PENGIRIM_AKHIR' : 'VERIFIKATOR',
        myVerificationStatus,
        verifiedCount: items.filter(
          (item) => item.statusVerifikasi === 'TERVERIFIKASI',
        ).length,
        rejectedCount: items.filter(
          (item) => item.statusVerifikasi === 'DITOLAK',
        ).length,
      };
    });
  }

  async approveFolderVerification(
    folderId: string,
    user: any,
    catatan?: string | null,
  ) {
    return this.verifyFolder(folderId, user, 'approve', catatan);
  }

  async rejectFolderVerification(
    folderId: string,
    user: any,
    catatan?: string | null,
  ) {
    return this.verifyFolder(folderId, user, 'reject', catatan);
  }

  async approveVerification(id: string, user: any, catatan?: string | null) {
    return this.verifySdeMasal(id, user, 'approve', catatan);
  }

  async rejectVerification(id: string, user: any, catatan?: string | null) {
    return this.verifySdeMasal(id, user, 'reject', catatan);
  }

  private async verifyFolder(
    folderId: string,
    user: any,
    action: 'approve' | 'reject',
    catatan?: string | null,
  ) {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');
    if (folder.status !== 'MENUNGGU_VERIFIKASI') {
      throw new BadRequestException('Folder tidak sedang menunggu verifikasi');
    }
    if (action === 'reject' && !String(catatan || '').trim()) {
      throw new BadRequestException('Alasan penolakan wajib diisi');
    }

    const rows = await this.repo.find({
      where: { folderId },
      order: { createdAt: 'ASC' },
    });
    const pendingRows = rows.filter(
      (row) => row.statusVerifikasi === 'MENUNGGU_VERIFIKASI',
    );
    if (!pendingRows.length) {
      throw new BadRequestException('Tidak ada item yang menunggu verifikasi');
    }

    const active = (pendingRows[0].verifikators || []).find(
      (verifikator: SdeMasalVerifikator) => verifikator.status === 'waiting',
    );
    if (!active)
      throw new BadRequestException('Tidak ada giliran verifikasi aktif');

    const persnum = String(user?.persnum ?? user?.username ?? '').trim();
    const position = String(user?.position ?? user?.positionId ?? '').trim();
    const isCurrentUser =
      (!!persnum && String(active.persnum) === persnum) ||
      (!!position && String(active.position) === position);
    if (!isCurrentUser) {
      throw new ForbiddenException(
        'Belum giliran Anda untuk memverifikasi SDE Massal ini',
      );
    }

    // Hanya BOD (Direksi) yang boleh menyetujui/menolak folder.
    // Verifikator non-BOD hanya dapat membaca chain (read-only).
    this.assertBodVerifier(user);

    const now = new Date().toISOString();
    for (const item of pendingRows) {
      const verifikators = [
        ...(item.verifikators || []),
      ] as SdeMasalVerifikator[];
      const current = verifikators.find((v) => v.status === 'waiting');
      if (!current) continue;

      current.catatan = catatan || null;
      if (action === 'reject') {
        current.status = 'rejected';
        current.rejectedAt = now;
        item.statusVerifikasi = 'DITOLAK';
        item.errorMessage = catatan || 'Ditolak verifikator';
      } else {
        current.status = 'verified';
        current.verifiedAt = now;
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
      }
      item.verifikators = verifikators;
    }

    await this.repo.save(pendingRows);
    await this.refreshFolderCounters(folderId);
    const updatedFolder = await this.folderRepo.findOne({
      where: { id: folderId },
    });
    if (action === 'reject') {
      const creatorPosition = await this.resolveSdeMasalCreatorPosition(
        folder,
        pendingRows.find((item) => item.createdBy)?.createdBy,
      );
      await this.notifySdeMasalPositions(
        [creatorPosition || folder.createdBy],
        {
          title: 'SDE Massal Dikembalikan',
          body: `Folder "${folder.judul || '-'}" dikembalikan oleh verifikator. Catatan: ${String(catatan || '').trim()}`,
          action: 'OPEN_SDE_MASAL_FOLDER',
          folderId: folder.id,
          status: 'DIKEMBALIKAN',
          reason: String(catatan || '').trim(),
        },
      );
    } else {
      const nextPositions = pendingRows
        .flatMap((item) => item.verifikators || [])
        .filter(
          (verifikator: SdeMasalVerifikator) =>
            verifikator.status === 'waiting',
        )
        .map((verifikator: SdeMasalVerifikator) => verifikator.position);
      if (nextPositions.length > 0) {
        await this.notifySdeMasalPositions(nextPositions, {
          title: 'SDE Massal Menunggu Verifikasi',
          body: `Folder "${folder.judul || '-'}" menunggu verifikasi Anda.`,
          action: 'OPEN_SDE_MASAL_VERIFIKASI',
          folderId: folder.id,
          status: 'MENUNGGU_VERIFIKASI',
        });
      } else if (updatedFolder?.status === 'MENUNGGU_PENGIRIM') {
        await this.notifySdeMasalPositions([updatedFolder.pengirimId], {
          title: 'SDE Massal Menunggu Pengirim',
          body: `Folder "${updatedFolder.judul || '-'}" sudah diverifikasi dan menunggu difinalisasi.`,
          action: 'OPEN_SDE_MASAL_FOLDER',
          folderId: updatedFolder.id,
          status: updatedFolder.status,
        });
      }
    }
    return {
      folder: updatedFolder,
      total: rows.length,
      processed: pendingRows.length,
      status: updatedFolder?.status || folder.status,
    };
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

    // Hanya BOD (Direksi) yang boleh menyetujui/menolak item.
    // Verifikator non-BOD hanya dapat membaca chain (read-only).
    this.assertBodVerifier(user);

    if (action === 'reject') {
      current.status = 'rejected';
      current.rejectedAt = new Date().toISOString();
      current.catatan = catatan || null;
      item.statusVerifikasi = 'DITOLAK';
      item.errorMessage = catatan || 'Ditolak verifikator';
      item.verifikators = verifikators;
      const rejected = await this.repo.save(item);
      if (item.folderId) {
        await this.refreshFolderCounters(item.folderId);
        const folder = await this.folderRepo.findOne({
          where: { id: item.folderId },
        });
        const creatorPosition = folder
          ? await this.resolveSdeMasalCreatorPosition(folder, item.createdBy)
          : item.createdBy;
        await this.notifySdeMasalPositions(
          [creatorPosition || folder?.createdBy],
          {
            title: 'SDE Massal Dikembalikan',
            body: `Folder "${folder?.judul || '-'}" dikembalikan oleh verifikator. Catatan: ${String(catatan || '').trim()}`,
            action: 'OPEN_SDE_MASAL_FOLDER',
            folderId: item.folderId,
            status: 'DIKEMBALIKAN',
            reason: String(catatan || '').trim(),
          },
        );
      }
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
    if (item.folderId) {
      await this.refreshFolderCounters(item.folderId);
      const folder = await this.folderRepo.findOne({
        where: { id: item.folderId },
      });
      // Approval is performed per recipient, but the notification belongs to the
      // folder transition. Only notify when this is the first row waiting for
      // the next verifier; subsequent row approvals must not create duplicate
      // toasts for the same folder.
      let shouldNotifyNextVerifier = false;
      if (next) {
        const rowsAfterApproval = await this.repo.find({
          where: { folderId: item.folderId },
        });
        const waitingNextCount = rowsAfterApproval.filter((row) =>
          (row.verifikators || []).some(
            (verifikator: SdeMasalVerifikator) =>
              verifikator.status === 'waiting' &&
              String(verifikator.position) === String(next.position),
          ),
        ).length;
        shouldNotifyNextVerifier = waitingNextCount === 1;
      }
      if (next && shouldNotifyNextVerifier) {
        await this.notifySdeMasalPositions([next.position], {
          title: 'SDE Massal Menunggu Verifikasi',
          body: `Folder "${folder?.judul || '-'}" menunggu verifikasi Anda.`,
          action: 'OPEN_SDE_MASAL_VERIFIKASI',
          folderId: item.folderId,
          status: 'MENUNGGU_VERIFIKASI',
        });
      } else if (folder?.status === 'MENUNGGU_PENGIRIM') {
        await this.notifySdeMasalPositions([folder.pengirimId], {
          title: 'SDE Massal Menunggu Pengirim',
          body: `Folder "${folder.judul || '-'}" sudah diverifikasi dan menunggu difinalisasi.`,
          action: 'OPEN_SDE_MASAL_FOLDER',
          folderId: folder.id,
          status: folder.status,
        });
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

  async findNaskahDetail(
    naskahId: string,
    positionId?: string | number,
    persnum?: string | number,
  ): Promise<any | null> {
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
    if (folder) {
      await this.findNaskahInFolder(
        folder.id,
        String(positionId ?? ''),
        String(persnum ?? ''),
      );
    }

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
      ? this.getAttachmentRefs(
          sdeMasalItem,
          this.parseRecipientData(sdeMasalItem),
        )
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

  /**
   * Ambil PDF untuk preview/print SDE Massal dari Terkirim.
   *
   * Naskah BSrE harus memakai final_pdf asli karena render ulang akan membuang
   * signature digital. Naskah non-BSrE tetap dapat dirender dari data Excel
   * agar placeholder penerima historis yang kosong dapat dipulihkan.
   */
  async generateSentNaskahPreviewPdf(
    naskahId: string,
    user: any,
  ): Promise<Buffer> {
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });
    if (!naskah) throw new NotFoundException('Naskah tidak ditemukan');

    const item = await this.repo.findOne({ where: { naskahId } });
    if (!item?.folderId) {
      throw new NotFoundException('Naskah SDE Massal tidak ditemukan');
    }

    const folder = await this.folderRepo.findOne({
      where: { id: item.folderId },
    });
    if (!folder)
      throw new NotFoundException('Folder SDE Massal tidak ditemukan');

    // Dokumen BSrE wajib memakai file final hasil signing. Merender ulangnya
    // akan menghilangkan struktur signature (/Sig + ByteRange).
    // Data Excel untuk naskah baru sudah dirender sebelum proses signing, jadi
    // final_pdf tetap memuat placeholder penerima sekaligus tanda tangan asli.
    if (naskah.signOption === 'digsig' && naskah.final_pdf) {
      return this.storageService.getFile(naskah.final_pdf);
    }

    const recipient = this.normalizeMassalRecipient(
      this.parseRecipientData(item),
    );
    // Tanggal folder adalah tanggal konsep yang dipilih user dan menjadi
    // sumber kanonik untuk preview maupun PDF final. Fallback ke tanggal
    // naskah hanya untuk data lama yang belum memiliki tanggal folder.
    const tanggal = folder.tanggal
      ? new Date(folder.tanggal).toISOString().slice(0, 10)
      : naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const tembusanEksternal = String(
      recipient.tembusanEksternal || recipient.tembusan_eksternal || '',
    );
    let tembusanInternal = String(
      recipient.tembusanInternal || recipient.tembusan_internal || '',
    );
    const authorityPositionId = String(folder.atasNamaPositionId || '').trim();
    if (authorityPositionId) {
      const internalIds = tembusanInternal
        .split(/[,;]/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (!internalIds.includes(authorityPositionId)) {
        internalIds.push(authorityPositionId);
      }
      tembusanInternal = internalIds.join(';');
    }
    const [tembusanNames, tembusanInternalNames, tembusanEksternalNames] =
      await Promise.all([
        this.resolveTembusanForPreview(
          tembusanEksternal,
          tembusanInternal,
          tanggal,
          recipient.tembusan,
        ),
        this.resolveTembusanForPreview('', tembusanInternal, tanggal),
        this.resolveTembusanForPreview(
          tembusanEksternal,
          '',
          tanggal,
          !tembusanEksternal ? recipient.tembusan : undefined,
        ),
      ]);
    const formatTembusan = (names: string[]): string =>
      names.length > 0
        ? names.map((name, index) => `${index + 1}. ${name}`).join('\n')
        : '';
    const hasTembusanPlaceholder =
      /\{\{\s*tembusan(?:_internal|_eksternal)?\s*\}\}/i.test(
        folder.kontenTemplate || '',
      );
    const konten = this.renderFolderKonten(folder, item, {
      ...recipient,
      // Semua placeholder tembusan dirender ke label yang benar. Khusus
      // tembusan internal, resolver memakai position ID -> position_text,
      // bukan persnum_person_text/nama personelnya.
      tembusan: formatTembusan(tembusanNames),
      tembusan_internal: formatTembusan(tembusanInternalNames),
      tembusan_eksternal: formatTembusan(tembusanEksternalNames),
    });

    const pengirim = await this.sirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });
    const penerima = await this.sirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'penerima' },
      order: { urutan: 'ASC' },
    });
    const tembusan = await this.sirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'tembusan' },
      order: { urutan: 'ASC' },
    });
    const attachmentRefs = this.getAttachmentRefs(item, recipient);
    const signedQrData = naskah.signOption === 'qr_only'
      ? {
          document_id: naskahId,
          signature_id: '',
          document_number: naskah.nomor || '',
          signed_at: (naskah.createdAt || new Date()).toISOString(),
          signer_name: pengirim?.namaSirkuler || '',
          signer_jabatan: pengirim?.positionText || '',
          document_type: 'Surat Dinas Eksternal',
        }
      : undefined;
    const headerInfo = await this.sdeService.getHeaderInfoByUser(
      {
        company: user?.company,
        area: user?.area,
        subArea: user?.subArea,
      },
      tanggal,
    );

    return this.sdeService.generatePdfFromHtml(
      konten,
      penerima.map((row) => row.namaSirkuler || ''),
      naskah.tempat || headerInfo?.kota || 'Tangerang',
      tanggal,
      pengirim?.positionText || '',
      pengirim?.namaSirkuler || '',
      // Jika template sudah memiliki placeholder tembusan, jangan tambahkan
      // blok Tembusan Yth. kedua dari generator PDF. Jika tidak, gunakan hasil
      // resolver position ID -> jabatan agar tidak menampilkan nama orang.
      hasTembusanPlaceholder
        ? []
        : tembusanNames.length > 0
          ? tembusanNames
          : tembusan.map((row) => formatGmRecipientLabel(row) ?? row.positionText ?? row.namaSirkuler ?? ''),
      [],
      naskah.perihal || recipient.perihal || '',
      naskah.sifat || folder.sifat || 'biasa',
      naskah.nomor || '',
      naskah.lampiran || '-',
      headerInfo || undefined,
      naskah.english === true,
      folder.atasNama || '',
      attachmentRefs.map((ref) => ({ fileName: ref.fileName, key: ref.key })),
      naskah.signOption || undefined,
      signedQrData,
    );
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

  /**
   * Samakan field standar dengan nilai dari kolom Excel dinamis.
   * Parser Excel menyimpan seluruh kolom di `variables`, sementara beberapa
   * field kompatibilitas pada object utama sengaja dibuat kosong/null.
   */
  private normalizeMassalRecipient(
    recipient: Record<string, any>,
  ): Record<string, any> {
    const variables =
      recipient.variables && typeof recipient.variables === 'object'
        ? recipient.variables
        : {};

    const value = (...keys: string[]): string => {
      for (const key of keys) {
        const direct = recipient[key];
        if (direct !== null && direct !== undefined && String(direct).trim()) {
          return String(direct).trim();
        }
        const variable = variables[key.toLowerCase()];
        if (
          variable !== null &&
          variable !== undefined &&
          String(variable).trim()
        ) {
          return String(variable).trim();
        }
      }
      return '';
    };

    const normalized = {
      ...recipient,
      variables,
      nama: value('nama'),
      alamat: value('alamat') || null,
      kota: value('kota') || null,
      kodePos: value('kodePos', 'kode_pos', 'kodepos') || null,
      jabatan: value('jabatan'),
      keterangan: value('keterangan') || null,
      jabatanPenerima: value('jabatanPenerima', 'jabatan_penerima') || null,
      alamatPenerima: value('alamatPenerima', 'alamat_penerima') || null,
      panggilanPenerima:
        value('panggilanPenerima', 'panggilan_penerima') || null,
    };

    return normalized;
  }

  private getMassalRecipientKey(value: unknown): string {
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rowNo = (parsed as Record<string, any>).no;
      if (rowNo !== null && rowNo !== undefined && String(rowNo).trim()) {
        return `row:${String(rowNo).trim()}`;
      }
    }

    const normalize = (input: any): any => {
      if (Array.isArray(input)) return input.map((item) => normalize(item));
      if (input && typeof input === 'object') {
        return Object.keys(input)
          .filter((key) => key !== 'lampiran' && key !== RESERVED_NOMOR_KEY)
          .sort()
          .reduce(
            (result, key) => {
              result[key] = normalize(input[key]);
              return result;
            },
            {} as Record<string, any>,
          );
      }
      return input;
    };

    return createHash('sha256')
      .update(JSON.stringify(normalize(parsed)))
      .digest('hex');
  }

  private deduplicateMassalRows(rows: SdeMasalEntity[]): SdeMasalEntity[] {
    const statusPriority: Record<string, number> = {
      MENUNGGU: 10,
      MENUNGGU_VERIFIKASI: 20,
      DITOLAK: 30,
      TERVERIFIKASI: 40,
      GAGAL: 50,
      TERKIRIM: 60,
    };
    const selected = new Map<string, SdeMasalEntity>();

    for (const row of rows) {
      const key = this.getMassalRecipientKey(row.recipientData);
      const current = selected.get(key);
      if (!current) {
        selected.set(key, row);
        continue;
      }

      const currentScore =
        (current.naskahId ? 1000 : 0) +
        (statusPriority[current.statusVerifikasi] || 0);
      const rowScore =
        (row.naskahId ? 1000 : 0) + (statusPriority[row.statusVerifikasi] || 0);
      if (rowScore > currentScore || row.updatedAt > current.updatedAt) {
        selected.set(key, row);
      }
    }

    return [...selected.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  private normalizeMassAttachmentName(value: unknown): string {
    const raw = String(value ?? '')
      .replace(/\\/g, '/')
      .trim();
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
    // Field standar dari parser Excel juga disalin ke `variables`. Pada data
    // lama, field langsung seperti `nama: ''` atau `alamat: null` dapat
    // menimpa nilai Excel jika spread dilakukan dengan urutan yang salah.
    // Nilai variable yang terisi harus menjadi fallback/rujukan untuk konten
    // template, terutama saat PDF final dibuat setelah folder dikirim.
    const variableValues =
      recipient.variables && typeof recipient.variables === 'object'
        ? recipient.variables
        : {};
    const values = {
      ...recipient,
      ...variableValues,
      tertuju: recipient.tertuju || variableValues.tertuju || '',
      perihal: recipient.perihal || variableValues.perihal || '',
      tembusan: recipient.tembusan || variableValues.tembusan || '',
      tembusan_internal:
        recipient.tembusanInternal ||
        recipient.tembusan_internal ||
        variableValues.tembusan_internal ||
        variableValues.tembusanInternal ||
        '',
      tembusan_eksternal:
        recipient.tembusanEksternal ||
        recipient.tembusan_eksternal ||
        variableValues.tembusan_eksternal ||
        variableValues.tembusanEksternal ||
        '',
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
      return (pos ? formatGmRecipientLabel(pos) : undefined) ?? pos?.position_text ?? pos?.persnum_person_text ?? posId;
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
        isDraft: status === 'pending' || status === 'pending_tte',
        urutan: urutan++,
      });
      await this.sirkulasiRepository.save(row);
    }
  }

  private async refreshFolderCounters(folderId: string): Promise<void> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder) return;
    const previousStatus = folder.status;
    const rows = this.deduplicateMassalRows(
      await this.repo.find({ where: { folderId } }),
    );
    const totalItems = rows.length;
    const totalTerkirim = rows.filter(
      (row) => row.statusVerifikasi === 'TERKIRIM',
    ).length;
    const totalDitolak = rows.filter(
      (row) => row.statusVerifikasi === 'DITOLAK',
    ).length;
    const totalTerverifikasi = rows.filter(
      (row) => row.statusVerifikasi === 'TERVERIFIKASI',
    ).length;
    const totalGagal = rows.filter(
      (row) => row.statusVerifikasi === 'GAGAL',
    ).length;
    const totalMenungguVerifikasi = rows.filter(
      (row) => row.statusVerifikasi === 'MENUNGGU_VERIFIKASI',
    ).length;
    const allEmailsSent =
      totalItems > 0 &&
      rows.every((row) => {
        const recipient = this.parseRecipientData(row);
        const sentAt =
          folder.recipientType === 'INTERNAL'
            ? recipient.internalInboxSentAt
            : recipient.emailSentAt;
        return String(sentAt || '').trim().length > 0;
      });

    // Penolakan pengirim mengembalikan folder ke konseptor, sementara item
    // yang sudah diverifikasi tetap berstatus TERVERIFIKASI. Jangan biarkan
    // sinkronisasi counter otomatis mengubah DIKEMBALIKAN menjadi
    // MENUNGGU_PENGIRIM sebelum konseptor mengajukan ulang foldernya.
    const hasRejectionReason =
      String(folder.rejectionReason || '').trim().length > 0;
    const keepReturnedStatus =
      (previousStatus === 'DIKEMBALIKAN' || hasRejectionReason) &&
      totalItems > 0 &&
      totalMenungguVerifikasi === 0 &&
      totalDitolak === 0 &&
      totalTerkirim < totalItems;

    if (keepReturnedStatus) {
      folder.status = 'DIKEMBALIKAN';
    } else if (totalItems === 0) {
      folder.status = 'DRAFT';
    } else if (totalTerkirim === totalItems) {
      folder.status = allEmailsSent ? 'TERKIRIM' : 'SIAP_KIRIM';
    } else if (totalTerkirim > 0 || totalGagal > 0) {
      folder.status = 'SEBAGIAN_TERKIRIM';
    } else if (totalMenungguVerifikasi > 0) {
      folder.status = 'MENUNGGU_VERIFIKASI';
    } else if (totalTerverifikasi > 0) {
      // Item yang terverifikasi siap diperiksa Pengirim. Item ditolak tetap
      // berada di folder yang sama untuk diperbaiki dan diverifikasi ulang.
      folder.status = 'MENUNGGU_PENGIRIM';
    } else if (totalDitolak === totalItems) {
      folder.status = 'DIKEMBALIKAN';
    } else {
      folder.status = 'DRAFT';
    }

    // Pengirim final tetap memakai pengirim yang dipilih saat konsep dibuat.
    // Verifikator terakhir bukan otomatis pengirim; pada chain Direktur Teknik
    // → EVP → VP → AVP → Staff, EVP selesai memverifikasi lalu tugas final
    // berpindah ke Direktur Teknik untuk Tolak/Finalisasi.
    // Jangan menyimpan ulang folder ketika statusnya tidak berubah. Method ini
    // juga dipanggil saat detail dibuka; menyimpan tanpa perubahan akan
    // memperbarui updatedAt dan membuat folder tiba-tiba naik ke urutan teratas.
    // Jika status memang berubah karena aksi workflow, save tetap dilakukan
    // agar waktu aktivitas folder ikut berubah secara valid.
    if (folder.status !== previousStatus) {
      await this.folderRepo.save(folder);
    }
  }

  private normalizeVerifikators(verifikators: any[]): SdeMasalVerifikator[] {
    const normalized = verifikators.map((item) => ({
      source: item,
      roleRank: this.getVerificationRoleRank(
        item?.jabatan || item?.positionText,
      ),
    }));

    if (normalized.some((item) => item.roleRank == null)) {
      throw new BadRequestException(
        'Verifikator SDE Massal harus berasal dari jenjang AVP, VP, EVP, atau Direksi',
      );
    }

    // Urutan chain berasal dari frontend/endpoint disposisi. Satu folder hanya
    // boleh memiliki satu posisi pada tiap level dan level yang digunakan
    // mengikuti chain disposisi. Chain boleh parsial: Made → Raihan hanya
    // menghasilkan Made, sedangkan Rahmat → Said → Made → Raihan menghasilkan
    // Rahmat → Said → Made.
    const ranks = normalized.map((item) => item.roleRank as number);
    if (new Set(ranks).size !== ranks.length) {
      throw new BadRequestException(
        'Setiap jenjang verifikator hanya boleh muncul satu kali',
      );
    }

    return normalized.map(({ source: item }, index) => ({
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

  /**
   * Mengembalikan posisi organisasi terbaru. Semua pencarian role SDE Massal
   * menggunakan snapshot master yang sama dengan komponen SDE biasa.
   */
  private async getLatestOrgPositions(): Promise<any[]> {
    try {
      const org = await this.orgDataService.findLatestOrg();
      const raw = org?.position_json;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.logger.warn(
        `Gagal membaca snapshot organisasi SDE Massal: ${error?.message || error}`,
      );
      return [];
    }
  }

  /**
   * Resolve penerima SDE Massal internal dari direktori org-data. Identitas
   * selalu dicocokkan tepat terhadap ID karyawan; nama/email tidak pernah
   * dipakai untuk memilih penerima.
   */
  private async resolveInternalRecipients(recipients: any[]): Promise<any[]> {
    const positions = await this.getLatestOrgPositions();
    if (positions.length === 0) {
      throw new BadRequestException(
        'Direktori karyawan internal tidak tersedia. Coba lagi setelah data organisasi dimuat.',
      );
    }

    const normalizeId = (value: unknown) => {
      let normalized = String(value ?? '').trim().replace(/[\s\u00a0]/g, '');
      if (/^\d+\.0+$/.test(normalized)) normalized = normalized.replace(/\.0+$/, '');
      return normalized;
    };
    const seenEmployeeIds = new Set<string>();

    return recipients.map((recipient, index) => {
      const rowNumber = recipient?.no ?? index + 1;
      const rawId =
        recipient?.employeeIdInput ??
        recipient?.employeeId ??
        recipient?.eNik ??
        recipient?.e_nik ??
        recipient?.persnum ??
        recipient?.variables?.['id karyawan (e-nik/persnum)'] ??
        '';
      const inputId = normalizeId(rawId);
      if (!inputId) {
        throw new BadRequestException(
          `Baris ${rowNumber}: ID karyawan kosong. Isi e-NIK atau Persnum.`,
        );
      }
      if (!String(recipient?.perihal ?? '').trim()) {
        throw new BadRequestException(`Baris ${rowNumber}: Perihal wajib diisi.`);
      }

      const matches = positions.filter((position: any) =>
        [
          position?.persnum_person,
          position?.persnum,
          position?.e_nik,
          position?.enik,
          position?.eNik,
        ].some((candidate) => normalizeId(candidate) === inputId),
      );
      if (matches.length === 0) {
        throw new BadRequestException(
          `Baris ${rowNumber}: ID karyawan "${inputId}" tidak ditemukan di direktori.`,
        );
      }

      const employeeIds = new Set(
        matches
          .map((position: any) =>
            normalizeId(
              position?.persnum_person ??
                position?.persnum ??
                position?.e_nik ??
                position?.enik,
            ),
          )
          .filter(Boolean),
      );
      if (employeeIds.size > 1) {
        throw new BadRequestException(
          `Baris ${rowNumber}: ID karyawan "${inputId}" cocok ke lebih dari satu karyawan. Periksa master pegawai.`,
        );
      }

      const employeeId = [...employeeIds][0] || inputId;
      if (seenEmployeeIds.has(employeeId)) {
        throw new BadRequestException(
          `Baris ${rowNumber}: ID karyawan "${inputId}" duplikat di file.`,
        );
      }
      seenEmployeeIds.add(employeeId);

      // Jika seorang karyawan memiliki lebih dari satu posisi, gunakan posisi
      // definitif (YBS) yang diprioritaskan oleh sumber direktori. Urutan
      // snapshot menjadi fallback yang sama dengan endpoint my-position.
      const position =
        matches.find(
          (candidate: any) =>
            String(candidate?.position_status ?? candidate?.positionStatus ?? '')
              .trim()
              .toLowerCase() === 'ybs',
        ) || matches[0];
      const employeeName = String(position?.persnum_person_text || '').trim();
      const positionId = String(position?.position ?? '').trim();
      const positionText = String(position?.position_text || '').trim();
      const organizationText = String(position?.organization_text || '').trim();
      if (!employeeName || !positionId || !positionText || !organizationText) {
        throw new BadRequestException(
          `Baris ${rowNumber}: data nama, jabatan, unit kerja, atau posisi karyawan tidak lengkap.`,
        );
      }

      const display = `${employeeName} — ${positionText} — ${organizationText}`;
      const variables = {
        ...(recipient?.variables && typeof recipient.variables === 'object'
          ? recipient.variables
          : {}),
        tertuju: display,
        nama: employeeName,
        jabatan: positionText,
        unit_kerja: organizationText,
        id_karyawan: employeeId,
        persnum: employeeId,
      };
      return {
        ...recipient,
        recipientType: 'INTERNAL',
        employeeIdInput: inputId,
        employeeId,
        employeePersnum: normalizeId(position?.persnum_person ?? position?.persnum) || employeeId,
        employeePositionId: positionId,
        employeeName,
        employeePositionText: positionText,
        employeeOrganizationText: organizationText,
        employeePositionStatus: String(
          position?.position_status ?? position?.positionStatus ?? 'ybs',
        ).toLowerCase(),
        employeeCompanyId: String(position?.company ?? COMPANY_ID),
        employeeCompanyText: String(
          position?.company_text ?? position?.companyText ?? 'PERUM LPPNPI',
        ),
        employeeAreaId: String(position?.area ?? ''),
        employeeAreaText: String(position?.area_text ?? ''),
        employeeSubAreaId: String(position?.sub_area ?? ''),
        employeeSubAreaText: String(position?.sub_area_text ?? ''),
        employeeOrganizationId: String(
          position?.organization_id ?? position?.organization ?? '',
        ),
        employeeEmail: position?.email || position?.email_person || null,
        persnum: normalizeId(position?.persnum_person ?? position?.persnum) || employeeId,
        nama: employeeName,
        jabatan: positionText,
        tertuju: display,
        idTertuju: '',
        variables,
        isValid: true,
        validationMessage: undefined,
      };
    });
  }

  /**
   * Rank workflow SDE Massal: AVP (1), VP (2), EVP (3), Direktur (4),
   * Direktur Utama (5).
   * Jabatan diproses case-insensitive dan tidak mengandalkan nama orang.
   */
  private getVerificationRoleRank(value: unknown): number | null {
    const text = String(value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
    if (/\bAVP\b/.test(text)) return 1;
    if (/\bVP\b/.test(text)) return 2;
    if (/\bEVP\b/.test(text)) return 3;
    if (
      /\bDIREKTUR\s+UTAMA\b/.test(text) ||
      /\bDIRUT\b/.test(text) ||
      /\bPRESIDENT\s+DIRECTOR\b/.test(text)
    )
      return 5;
    if (/\bDIREKTUR\b|\bDIRECTOR\b/.test(text)) return 4;
    return null;
  }

  /**
   * Validasi aksi verifikasi SDE Massal: hanya BOD (Direksi) yang boleh
   * menyetujui/menolak. Verifikator non-BOD (mis. staff/konseptor) hanya
   * dapat membaca chain verifikasi (read-only).
   *
   * Sumber kebenaran: bodTag dari JWT (BOD/BOD-0/BOD-1/BOD-2/BOD-3) atau
   * position_text snapshot organisasi yang mengandung DIREKTUR/DIRUT.
   */
  private assertBodVerifier(user: any): void {
    const bodTag = String(user?.bodTag ?? '')
      .trim()
      .toUpperCase();
    const allowedBodTags = ['BOD', 'BOD-0', 'BOD-1', 'BOD-2', 'BOD-3'];
    if (allowedBodTags.includes(bodTag)) return;

    // Fallback: cek jabatan dari snapshot organisasi berdasarkan position ID.
    const positionText = String(user?.positionText ?? '').toUpperCase();
    if (/\bDIREKTUR\b|\bDIRUT\b|\bDIRECTOR\b/.test(positionText)) return;

    throw new ForbiddenException(
      'Hanya BOD (Direksi) yang dapat memverifikasi SDE Massal. Verifikator non-BOD hanya dapat melihat chain verifikasi.',
    );
  }

  private formatPositionName(position: any): string {
    const name = String(
      position?.persnum_person_text || position?.nama || '',
    ).trim();
    const job = String(
      position?.position_text || position?.jabatan || '',
    ).trim();
    return (
      [name, job].filter(Boolean).join(' - ') ||
      String(position?.position || '-')
    );
  }

  /**
   * Gunakan kanal notifikasi existing agar SDE Massal ikut mendapatkan
   * unread badge, toast realtime, dan push notification bila tersedia.
   * SYSTEM dipakai agar tidak membutuhkan perubahan enum database lama;
   * kategori + action membedakan event SDE Massal di frontend.
   */
  private async notifySdeMasalPositions(
    positionIds: Array<string | number | null | undefined>,
    payload: {
      title: string;
      body: string;
      action: 'OPEN_SDE_MASAL_FOLDER' | 'OPEN_SDE_MASAL_VERIFIKASI';
      folderId: string;
      status: string;
      reason?: string;
    },
  ): Promise<void> {
    const targets = [
      ...new Set(
        positionIds.map((value) => String(value ?? '').trim()).filter(Boolean),
      ),
    ];
    if (targets.length === 0) return;

    const positions = await this.getLatestOrgPositions();
    await Promise.all(
      targets.map(async (positionId) => {
        const notificationKey = [
          payload.folderId,
          payload.status,
          payload.action,
          positionId,
        ].join('|');
        const inFlight = this.sdeMasalNotificationInFlight.get(notificationKey);
        if (inFlight) {
          await inFlight;
          return;
        }

        const notificationPromise = (async () => {
          const position = positions.find(
            (item) => String(item?.position ?? '').trim() === positionId,
          );
          const rawPersnum = String(position?.persnum_person ?? '').trim();
          const userPersnum =
            rawPersnum && Number.isFinite(Number(rawPersnum))
              ? Number(rawPersnum)
              : undefined;
          try {
            await this.notificationService.createNotification({
              positionId,
              userPersnum,
              type: NotificationType.SYSTEM,
              title: payload.title,
              body: payload.body,
              data: {
                category: 'SDE_MASAL',
                action: payload.action,
                folderId: payload.folderId,
                status: payload.status,
                ...(payload.reason ? { reason: payload.reason } : {}),
              },
            });
          } catch (error: any) {
            // Notifikasi tidak boleh membatalkan perubahan status workflow.
            this.logger.warn(
              `Gagal mengirim notifikasi SDE Massal ke ${positionId}: ${error?.message || error}`,
            );
          }
        })();

        this.sdeMasalNotificationInFlight.set(
          notificationKey,
          notificationPromise,
        );
        try {
          await notificationPromise;
        } finally {
          if (
            this.sdeMasalNotificationInFlight.get(notificationKey) ===
            notificationPromise
          ) {
            this.sdeMasalNotificationInFlight.delete(notificationKey);
          }
        }
      }),
    );
  }

  /**
   * Resolve posisi konseptor untuk notifikasi pengembalian.
   * Folder lama dapat belum memiliki created_by, sehingga gunakan posisi item
   * SDE atau posisi disposisi yang ditandai sebagai tindak lanjut.
   */
  private async resolveSdeMasalCreatorPosition(
    folder: SdeMasalFolderEntity,
    fallbackPosition?: string | null,
  ): Promise<string> {
    const direct = String(folder.createdBy || fallbackPosition || '').trim();
    if (direct) return direct;

    if (folder.parentNaskahId) {
      const followUp = await this.sirkulasiRepository
        .createQueryBuilder('sirkulasi')
        .where('sirkulasi.id_naskah = :naskahId', {
          naskahId: folder.parentNaskahId,
        })
        .andWhere('sirkulasi.tindak_lanjut = :followUp', { followUp: 1 })
        .andWhere('sirkulasi.sirkuler IN (:...sirkuler)', {
          sirkuler: ['penerima', 'tembusan'],
        })
        .orderBy('sirkulasi.updated_at', 'DESC')
        .getOne();

      const position = String(followUp?.position || '').trim();
      if (position) return position;
    }

    return '';
  }

  private async findPositionByRole(roleRank: number): Promise<any | null> {
    try {
      const positions = await this.getLatestOrgPositions();
      return (
        positions.find(
          (position) =>
            this.getVerificationRoleRank(position?.position_text) === roleRank,
        ) || null
      );
    } catch (error) {
      this.logger.warn(
        `Gagal membaca posisi role SDE Massal: ${error?.message || error}`,
      );
      return null;
    }
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
