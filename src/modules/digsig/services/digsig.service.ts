import {
  Injectable,
  NotFoundException,
  HttpException,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { StorageService } from '../../storage/services/storage.service';
import { NdEntity } from '../../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../../surat-dinas-internal/entities/sdi_sde.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { Session } from '../../auth/entities/session.entity';
import { TransferActiveToInactiveEntity } from '../../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { TransferActiveToInactiveService } from '../../transfer-active-to-inactive/services/transfer-active-to-inactive.service';
import {
  formatSignatureData,
  generateSignatureId,
} from '../../../common/helpers/signature.helper';
import { finalPdfQrReference } from './final-pdf-qr.util';
import { QRCodeService, QRCodeData } from './qrcode.service';
import { PdfQrEmbedService } from './pdf-qr-embed.service';
import { DigsigLogService } from './digsig-log.service';
import { GeneratePdfNodinService } from '../../generate_pdf/services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { DEFAULT_BSRE_NIK } from '../../../common/constants/bsre.constants';
import { isEvpOrAbovePosition } from '../../../common/helpers/evp-access.helper';
import axios, { AxiosError } from 'axios';

export interface DigsigParams {
  key: string; // key minio (path lengkap)
  filename: string; // filename.pdf
  nomorDokumen: string;
  tanggalDokumen: string;
  klasifikasi: string;
  jenisNaskah: string;
  perihal: string;
  nik: string;
  passphrase: string;
  path_dokumen: string;
  no_wa: string;
}

export interface VerifyDigsigParams {
  filename: string; // filename.pdf
  fileurl: string;
}

/**
 * Optional context for logging BSrE activities
 * Pass this to hitDigsigEndpoint for automatic logging
 */
export interface DigsigLogContext {
  userPersnum: number;
  userName?: string;
  idNaskah?: string;
  jenisNaskah?: string;
  ipAddress?: string;
  batch?: DigsigBatchContext;
}

export interface DigsigBatchContext {
  id: string;
  participantId: string;
  expectedCount: number;
}

type PendingDigsigBatchEntry = {
  params: DigsigParams;
  logContext: DigsigLogContext;
  resolve: (value: DigsigResponse) => void;
  reject: (reason: unknown) => void;
};

type PendingDigsigBatch = {
  expectedCount: number;
  entries: Map<string, PendingDigsigBatchEntry>;
  skipped: Set<string>;
  timer: NodeJS.Timeout;
  processing: boolean;
};

export interface DigsigResponse {
  status: string;
  message: string;
  doc_id?: string | null;
  signature_id?: string | null;
  name_doc?: string[];
  signed_file_path?: string;
  data?: any;
}

type BsreV2Response = {
  file?: string[];
  time?: unknown;
  error?: string;
  message?: string;
};

export interface SignResultResponse {
  message: string;
  data: DigsigResponse;
  signature_metadata: {
    type: string;
    doc_id: string | null;
    signed_at: string;
    signer_nik: string | null;
    path: string | null;
  };
}

export interface SignInternalResultResponse {
  message: string;
  signature_metadata: {
    type: string;
    signature_id: string;
    signed_at: string;
    signer_id: string | null;
    signer_name: string | null;
    signer_jabatan: string | null;
    path: string | null;
  };
}

// Default passphrase untuk testing
const DEFAULT_PASSPHRASE = '12345';

// Default COMPANY_ID
const COMPANY_ID = process.env.COMPANY_ID || '1000';

// Base URL untuk verifikasi (ganti dengan URL production nanti)
const VERIFICATION_BASE_URL =
  process.env.VERIFICATION_URL ||
  'https://arsipku.airnavindonesia.co.id/verify';

@Injectable()
export class DigsigService {
  private readonly pendingBatches = new Map<string, PendingDigsigBatch>();

  constructor(
    private readonly storageService: StorageService,
    private readonly qrCodeService: QRCodeService,
    private readonly pdfQrEmbedService: PdfQrEmbedService,
    private readonly digsigLogService: DigsigLogService,
    private readonly generatePdfNodinService: GeneratePdfNodinService,
    private readonly generatePdfSudinService: GeneratePdfSudinService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    @InjectRepository(NdEntity)
    private readonly ndRepository: Repository<NdEntity>,
    @InjectRepository(SdiSdeEntity)
    private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(TransferActiveToInactiveEntity)
    private readonly transferRepository: Repository<TransferActiveToInactiveEntity>,
    private readonly transferActiveToInactiveService: TransferActiveToInactiveService,
  ) {}

  /**
   * Get BSrE Sign In URL from environment variable
   * Evaluated at runtime to ensure env vars are loaded
   * IMPORTANT: BSRE_SIGNIN_URL must be set in .env file
   */
  private get BSRE_SIGNIN_URL(): string {
    return process.env.BSRE_SIGNIN_URL!;
  }

  /**
   * Get BSrE Verify URL from environment variable
   * Evaluated at runtime to ensure env vars are loaded
   * IMPORTANT: BSRE_VERIFY_URL must be set in .env file
   */
  private get BSRE_VERIFY_URL(): string {
    return process.env.BSRE_VERIFY_URL!;
  }

  /**
   * Basic Auth header untuk BSrE API v2
   * Format: Basic base64(username:password)
   */
  private get BSRE_BASIC_AUTH_HEADER(): string {
    const user = process.env.BSRE_BASIC_USER || 'esign';
    const pass = process.env.BSRE_BASIC_PASS || '';
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  /**
   * Hit Digsig API Endpoint
   * @param params - DigsigParams for BSrE API
   * @param logContext - Optional context for logging (currently unused, for future logging)
   */
  async hitDigsigEndpoint(params: DigsigParams, logContext?: DigsigLogContext) {
    if (logContext?.batch && logContext.batch.expectedCount > 1) {
      return this.enqueueBulkSigning(params, logContext);
    }

    return this.hitDigsigEndpointSingle(params, logContext);
  }

  /**
   * Tandai satu peserta batch yang gagal sebelum mencapai proses BSrE.
   * Ini mencegah PDF lain menunggu peserta tersebut sampai timeout.
   */
  startBatch(batchId: string, expectedCount: number): void {
    this.getOrCreateBatch({
      id: batchId,
      participantId: '__batch_start__',
      expectedCount,
    });
  }

  skipBatchParticipant(batch: DigsigBatchContext): void {
    const state = this.pendingBatches.get(batch.id);
    // Batch yang sudah selesai tidak perlu dibuat ulang hanya untuk skip.
    if (!state) return;
    if (state.entries.has(batch.participantId)) return;
    state.skipped.add(batch.participantId);
    this.flushBatchWhenReady(batch.id, state);
  }

  private enqueueBulkSigning(
    params: DigsigParams,
    logContext: DigsigLogContext,
  ): Promise<DigsigResponse> {
    const batch = logContext.batch!;
    const state = this.getOrCreateBatch(batch);

    return new Promise<DigsigResponse>((resolve, reject) => {
      state.skipped.delete(batch.participantId);
      state.entries.set(batch.participantId, {
        params,
        logContext,
        resolve,
        reject,
      });
      this.flushBatchWhenReady(batch.id, state);
    });
  }

  private getOrCreateBatch(batch: DigsigBatchContext): PendingDigsigBatch {
    const existing = this.pendingBatches.get(batch.id);
    if (existing) {
      existing.expectedCount = Math.max(
        existing.expectedCount,
        batch.expectedCount,
      );
      return existing;
    }

    const state: PendingDigsigBatch = {
      expectedCount: batch.expectedCount,
      entries: new Map(),
      skipped: new Set(),
      processing: false,
      // Safety net: jika salah satu generator PDF berhenti sebelum mendaftar,
      // dokumen yang sudah siap tetap diproses dalam satu bulk request.
      timer: setTimeout(() => void this.flushBatch(batch.id), 30_000),
    };
    this.pendingBatches.set(batch.id, state);
    return state;
  }

  private flushBatchWhenReady(
    batchId: string,
    state: PendingDigsigBatch,
  ): void {
    if (
      !state.processing &&
      state.entries.size + state.skipped.size >= state.expectedCount
    ) {
      void this.flushBatch(batchId);
    }
  }

  private async flushBatch(batchId: string): Promise<void> {
    const state = this.pendingBatches.get(batchId);
    if (!state || state.processing) return;

    state.processing = true;
    clearTimeout(state.timer);
    this.pendingBatches.delete(batchId);
    const entries = [...state.entries.values()];
    if (entries.length === 0) return;

    try {
      const responses = await this.hitDigsigEndpointBulk(entries);
      entries.forEach((entry, index) => entry.resolve(responses[index]));
    } catch (error) {
      entries.forEach((entry) => entry.reject(error));
    }
  }

  /**
   * BSrE API v2 mendukung array file. Seluruh PDF SDE Massal dikirim dengan
   * satu autentikasi/passphrase, lalu hasilnya dikembalikan sesuai urutan.
   */
  private async hitDigsigEndpointBulk(
    entries: PendingDigsigBatchEntry[],
  ): Promise<DigsigResponse[]> {
    const first = entries[0];
    try {
      const buffers = await Promise.all(
        entries.map((entry) => this.storageService.getFile(entry.params.key)),
      );
      const timestamp = Date.now();
      const outputNames = entries.map((entry, index) =>
        entry.params.filename.replace(
          /\.pdf$/i,
          `-${timestamp}-${index + 1}.pdf`,
        ),
      );
      const signatureProperty = {
        imageBase64: '',
        tampilan: 'INVISIBLE',
        page: 1,
        originX: 0.0,
        originY: 0.0,
        width: 100.0,
        height: 75.0,
        location: null,
        reason: null,
        contactInfo: null,
      };
      const response = await axios.post<BsreV2Response>(
        this.BSRE_SIGNIN_URL,
        {
          nik: DEFAULT_BSRE_NIK,
          passphrase: first.params.passphrase,
          // Satu properti berlaku untuk seluruh file (semuanya invisible).
          signatureProperties: [signatureProperty],
          file: buffers.map((buffer) => buffer.toString('base64')),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.BSRE_BASIC_AUTH_HEADER,
          },
          timeout: 120_000,
        },
      );

      const signedFiles: string[] = response.data?.file || [];
      if (signedFiles.length !== entries.length) {
        throw new Error(
          `BSrE mengembalikan ${signedFiles.length} dari ${entries.length} file hasil signing`,
        );
      }

      const uploads = await Promise.all(
        entries.map((entry, index) =>
          this.storageService.uploadBuffer(
            Buffer.from(signedFiles[index], 'base64'),
            outputNames[index],
            'application/pdf',
            entry.params.path_dokumen.replace(/\/$/, ''),
          ),
        ),
      );

      const results = uploads.map((upload) => {
        const signedFileName = upload.key.split('/').pop()!;
        return {
          status: 'success',
          message: 'BSrE bulk signing berhasil',
          doc_id: null,
          signed_file_path: upload.key,
          data: {
            name_doc: [signedFileName],
            time: response.data?.time,
          },
        } satisfies DigsigResponse;
      });

      await Promise.all(
        entries.map(async (entry, index) => {
          try {
            await this.digsigLogService.logSignActivity({
              userPersnum: entry.logContext.userPersnum,
              userName: entry.logContext.userName,
              ipAddress: entry.logContext.ipAddress,
              idNaskah: entry.logContext.idNaskah,
              nomorNaskah: entry.params.nomorDokumen,
              jenisNaskah: entry.logContext.jenisNaskah,
              apiEndpoint: 'POST /signin (bulk)',
              status: 'sukses',
              note: `BSrE bulk signing berhasil (${index + 1}/${entries.length})`,
              bsreResponse: results[index],
            });
          } catch (logError) {
            console.error(
              '[DigsigService] Failed to log bulk success:',
              logError,
            );
          }
        }),
      );

      return results;
    } catch (error: any) {
      await Promise.all(
        entries.map(async (entry) => {
          try {
            await this.digsigLogService.logSignActivity({
              userPersnum: entry.logContext.userPersnum,
              userName: entry.logContext.userName,
              ipAddress: entry.logContext.ipAddress,
              idNaskah: entry.logContext.idNaskah,
              nomorNaskah: entry.params.nomorDokumen,
              jenisNaskah: entry.logContext.jenisNaskah,
              apiEndpoint: 'POST /signin (bulk)',
              status: 'gagal',
              note: axios.isAxiosError(error)
                ? error.response?.data?.error ||
                  error.response?.data?.message ||
                  error.message
                : error.message,
              bsreResponse: axios.isAxiosError(error)
                ? error.response?.data
                : { error: error.message },
            });
          } catch (logError) {
            console.error(
              '[DigsigService] Failed to log bulk failure:',
              logError,
            );
          }
        }),
      );

      if (axios.isAxiosError(error)) {
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message =
          error.response?.data?.error ||
          error.response?.data?.message ||
          'Gagal mengambil data dari service external';
        throw new HttpException(
          {
            success: false,
            message,
            source: 'external-service',
            detail: error.response?.data,
          },
          status,
        );
      }

      throw new HttpException(
        {
          success: false,
          message: error?.message || 'Bulk signing gagal',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async hitDigsigEndpointSingle(
    params: DigsigParams,
    logContext?: DigsigLogContext,
  ): Promise<DigsigResponse> {
    try {
      // Seluruh request BSrE menggunakan NIK bersama, termasuk request dari
      // token lama yang masih menyimpan NIK personal pengguna.
      const nik = DEFAULT_BSRE_NIK;
      console.log('[DigsigService] hitDigsigEndpoint - Starting...');
      console.log('[DigsigService] Params:', {
        key: params.key,
        filename: params.filename,
        nik,
        no_wa: params.no_wa,
        nomorDokumen: params.nomorDokumen,
        jenisNaskah: params.jenisNaskah,
      });

      // 1. Ambil file dari MinIO
      console.log('[DigsigService] Fetching file from MinIO:', params.key);
      const buffer = await this.storageService.getFile(params.key);
      console.log(
        '[DigsigService] File fetched, size:',
        buffer.length,
        'bytes',
      );
      const base64File = buffer.toString('base64');
      const dokumenName = params.filename;

      const timestamp = Date.now();
      const newDokumenName = dokumenName.replace(
        /\.pdf$/i,
        `-${timestamp}.pdf`,
      );

      // 2. Payload sesuai spesifikasi BSrE API v2
      //    Metadata dokumen (nomor, tanggal, klasifikasi, perihal, no_wa) tidak
      //    lagi dikirim — API v2 murni signing service.
      const payload = {
        nik,
        passphrase: params.passphrase,
        signatureProperties: [
          {
            imageBase64: '',
            tampilan: 'INVISIBLE',
            page: 1,
            originX: 0.0,
            originY: 0.0,
            width: 100.0,
            height: 75.0,
            location: null,
            reason: null,
            contactInfo: null,
          },
        ],
        file: [base64File],
      };

      console.log('[DigsigService] Payload prepared, hitting BSrE API v2...');
      console.log('[DigsigService] BSrE URL:', this.BSRE_SIGNIN_URL);

      // 3. Hit endpoint (Basic Auth)
      const response = await axios.post(this.BSRE_SIGNIN_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.BSRE_BASIC_AUTH_HEADER,
        },
        timeout: 30000,
      });

      console.log(
        '[DigsigService] BSrE Response keys:',
        Object.keys(response.data || {}),
      );

      // 3a. API v2 mengembalikan signed PDF langsung sebagai base64 di body
      //     (tidak lagi disimpan di server BSrE). Upload ke MinIO pada
      //     path_dokumen agar alur downstream (download signed PDF) tetap jalan.
      const rawV2Response = response.data;
      const signedFileB64: string | undefined = rawV2Response?.file?.[0];
      if (!signedFileB64) {
        throw new Error(
          'BSrE v2 tidak mengembalikan file hasil signing di response',
        );
      }
      const signedBuffer = Buffer.from(signedFileB64, 'base64');
      const signedUpload = await this.storageService.uploadBuffer(
        signedBuffer,
        newDokumenName,
        'application/pdf',
        params.path_dokumen.replace(/\/$/, ''),
      );
      console.log(
        '[DigsigService] Signed PDF uploaded to MinIO:',
        signedUpload.key,
      );

      // 3b. Adapter response v2 -> format lama (backward-compatible).
      //     PENTING: gunakan signedUpload.key (key aktual di MinIO, termasuk
      //     prefix {Date.now()}- yang ditambahkan uploadBuffer) sebagai
      //     name_doc. Downstream (step 11g ND/SDI/SDE/KA) melakukan
      //     getFile(`${path_dokumen}/${name_doc}`) — kalau name_doc tidak
      //     persis sama dengan key aktual, download signed PDF akan 404 dan
      //     naskah final tersimpan sebagai PDF TANPA TTE.
      //     Base64 PDF sengaja TIDAK disertakan agar log/DB tidak membengkak.
      const signedFileName = signedUpload.key.split('/').pop()!;
      const adaptedResponse: DigsigResponse = {
        status: 'success',
        message: 'BSrE signing berhasil',
        doc_id: null,
        signed_file_path: signedUpload.key,
        data: {
          name_doc: [signedFileName],
          time: rawV2Response?.time,
        },
      };
      response.data = adaptedResponse as any;

      // Log success if context provided
      console.log('[DigsigService] logContext received:', logContext);
      if (logContext) {
        try {
          console.log('[DigsigService] Attempting to log success...');
          const logResult = await this.digsigLogService.logSignActivity({
            userPersnum: logContext.userPersnum,
            userName: logContext.userName,
            ipAddress: logContext.ipAddress,
            idNaskah: logContext.idNaskah,
            nomorNaskah: params.nomorDokumen,
            jenisNaskah: logContext.jenisNaskah,
            apiEndpoint: 'POST /signin',
            status: 'sukses',
            note: 'BSrE signing berhasil',
            bsreResponse: response.data,
          });
          console.log('[DigsigService] Log saved successfully:', logResult.id);
        } catch (logError) {
          console.error('[DigsigService] Failed to log success:', logError);
        }
      } else {
        console.log(
          '[DigsigService] No logContext provided - skipping logging',
        );
      }

      return response.data as DigsigResponse;
    } catch (error: any) {
      // Log failure if context provided
      console.log('[DigsigService] Error occurred, logContext:', logContext);
      if (logContext) {
        try {
          console.log('[DigsigService] Attempting to log failure...');
          const logResult = await this.digsigLogService.logSignActivity({
            userPersnum: logContext.userPersnum,
            userName: logContext.userName,
            ipAddress: logContext.ipAddress,
            idNaskah: logContext.idNaskah,
            nomorNaskah: params.nomorDokumen,
            jenisNaskah: logContext.jenisNaskah,
            apiEndpoint: 'POST /signin',
            status: 'gagal',
            note: axios.isAxiosError(error)
              ? error.response?.data?.error ||
                error.response?.data?.message ||
                error.message
              : error.message,
            bsreResponse: axios.isAxiosError(error)
              ? error.response?.data
              : { error: error.message },
          });
          console.log('[DigsigService] Failure log saved:', logResult.id);
        } catch (logError) {
          console.error('[DigsigService] Failed to log failure:', logError);
        }
      } else {
        console.log(
          '[DigsigService] No logContext for failure - skipping logging',
        );
      }

      if (axios.isAxiosError(error)) {
        console.error('[DigsigService] Axios Error Message:', error.message);
        console.error('[DigsigService] Status:', error.response?.status);
        console.error(
          '[DigsigService] Response Data:',
          JSON.stringify(error.response?.data, null, 2),
        );
        console.error('[DigsigService] Request URL:', error.config?.url);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        // API v2 mengembalikan { error: "...", status_code: 2031 }
        const message =
          error.response?.data?.error ||
          error.response?.data?.message ||
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            source: 'external-service',
            detail: error.response?.data,
          },
          status,
        );
      }
      console.error('[DigsigService] Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Mendapatkan AirNav Access Token dari session berdasarkan persnum
   * Token ini digunakan untuk mengakses HR API
   * @param persnum - Persnum user yang login
   * @returns Token string untuk Authorization header
   */
  private async getAirnavTokenFromSession(persnum: number): Promise<string> {
    // Cari session terbaru dari user berdasarkan persnum
    const session = await this.sessionRepository.findOne({
      where: { userPersnum: persnum },
      order: { createdAt: 'DESC' }, // Ambil session terbaru
    });

    if (!session) {
      throw new BadRequestException(
        'Session tidak ditemukan. Silakan login ulang untuk melanjutkan.',
      );
    }

    // Check apakah token sudah expired
    if (new Date() > new Date(session.airnavExpiredAt)) {
      throw new BadRequestException(
        'Token AirNav sudah expired. Silakan login ulang untuk melanjutkan.',
      );
    }

    return session.airnavAccessToken;
  }

  /**
   * Get data user untuk BSrE signing (NIK dan no_wa) dari JWT payload
   * Gunakan method ini untuk fitur baru yang sudah menerima JwtPayload
   * @param user - JwtPayload user yang login (berisi NIK dan noWa)
   * @returns Object containing nik dan no_wa
   */
  getUserDataFromJwt(user: JwtPayload): { nik: string; no_wa: string } {
    console.log(
      `[DigsigService] Getting user data from JWT, persnum: ${user.persnum}`,
    );
    console.log(
      `[DigsigService] NIK: ${DEFAULT_BSRE_NIK.substring(0, 4)}****, noWa: ${user.noWa ? user.noWa.substring(0, 6) + '****' : '(tidak tersedia)'}`,
    );

    return {
      nik: DEFAULT_BSRE_NIK,
      no_wa: user.noWa || '',
    };
  }

  /**
   * BSrE v2 hanya memakai NIK bersama dan passphrase pada payload signing.
   * Batch tidak perlu menunggu lookup nomor telepon ke HR API.
   */
  getUserDataForMassalBsre(): { nik: string; no_wa: string } {
    return {
      nik: DEFAULT_BSRE_NIK,
      no_wa: '',
    };
  }

  /**
   * Get data user untuk BSrE signing. NIK menggunakan nilai bersama,
   * sedangkan no_wa tetap diambil dari HR API untuk kompatibilitas.
   * @deprecated Gunakan getUserDataFromJwt() untuk fitur baru.
   * Method ini tetap ada untuk backward compatibility dengan service lain (nota-dinas, surat-dinas-internal, dll)
   * @param persnum - Persnum user yang login
   * @returns Object containing nik dan no_wa
   */
  async getUserDataForBsre(
    persnum: string,
  ): Promise<{ nik: string; no_wa: string }> {
    console.log(
      `[DigsigService] DEPRECATED: Getting phone data for BSrE from HR API, persnum: ${persnum}`,
    );
    console.log(
      `[DigsigService] Consider using getUserDataFromJwt() instead for better performance`,
    );

    // Token masih diperlukan untuk mengambil nomor telepon opsional.
    const token = await this.getAirnavTokenFromSession(Number(persnum));

    const nik = DEFAULT_BSRE_NIK;

    // Get phone (optional)
    let no_wa = '';
    try {
      const phoneResponse = await axios.get(
        `https://api.airnavindonesia.co.id/dataset-dev/hc/communication-infos/${persnum}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );
      const phoneData = phoneResponse.data?.data ?? [];
      const phone = phoneData.find((x) => x.commType === '2');
      if (phone) {
        no_wa = phone.id;
        if (no_wa && no_wa.startsWith('0')) {
          no_wa = '+62' + no_wa.substring(1);
        } else if (no_wa && !no_wa.startsWith('+')) {
          no_wa = '+' + no_wa;
        }
      }
    } catch (error) {
      console.warn(
        `[DigsigService] Gagal mengambil nomor HP untuk persnum ${persnum}:`,
        error.message,
      );
      // Phone optional, continue without it
    }

    console.log(
      `[DigsigService] NIK: ${nik}, Phone: ${no_wa || '(tidak tersedia)'}`,
    );

    return { nik, no_wa };
  }

  // ============================================
  // SIGN DENGAN BSrE - NIK dan no_wa dari JWT
  // ============================================

  /**
   * Sign Berita Acara (BAC) pemindahan arsip dengan BSrE.
   * Dipanggil oleh pejabat pihak pertama BAC (EVP) dari halaman pemindahan.
   * Alur sama dengan naskah lain: BSrE v2 → upload signed PDF → update key.
   */
  async signBacBsre(
    transferId: string,
    dto: { passphrase: string },
    user: JwtPayload,
    signerType: 'pihak_pertama' | 'pihak_kedua' = 'pihak_pertama',
  ): Promise<SignResultResponse> {
    if (!isEvpOrAbovePosition(user)) {
      throw new ForbiddenException(
        'Penandatanganan BAC hanya dapat dilakukan oleh EVP dan jabatan di atasnya',
      );
    }

    console.log(
      `[DigsigService] signBacBsre - transferId: ${transferId}, persnum: ${user.persnum}`,
    );

    const nik = DEFAULT_BSRE_NIK;
    const noWa = user.noWa || '';

    // 1. Ambil usulan + validasi BAC PDF sudah di-generate
    const transfer = await this.transferRepository.findOne({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException(
        `Usulan pemindahan dengan ID ${transferId} tidak ditemukan`,
      );
    }
    if (!transfer.beritaAcaraUrl) {
      throw new BadRequestException(
        'Berita Acara belum di-generate. Klik "Generate BAC" terlebih dahulu',
      );
    }
    const isPihakKedua = signerType === 'pihak_kedua';
    if (isPihakKedua && !transfer.bacSignedAt) {
      throw new BadRequestException('Pihak pertama belum menandatangani BAC');
    }
    if (
      isPihakKedua &&
      transfer.status !== 'MENUNGGU_TTD_PIHAK_KEDUA'
    ) {
      throw new BadRequestException(
        'Tanda tangan pihak kedua baru dapat dilakukan setelah seluruh verifikasi TU selesai',
      );
    }
    const assignedPersnum = isPihakKedua
      ? transfer.bacPihakKeduaPersnum
      : transfer.bacPihakPertamaPersnum;
    if (isPihakKedua && !assignedPersnum) {
      throw new BadRequestException('Pejabat pihak kedua BAC belum ditetapkan');
    }
    const alreadySigned = isPihakKedua
      ? transfer.bacPihakKeduaSignedAt
      : transfer.bacSignedAt;
    if (alreadySigned) {
      throw new BadRequestException('Berita Acara ini sudah ditandatangani');
    }
    if (assignedPersnum && Number(assignedPersnum) !== Number(user.persnum)) {
      throw new BadRequestException(
        `Hanya pejabat ${isPihakKedua ? 'pihak kedua' : 'pihak pertama'} BAC yang dapat menandatangani berita acara ini`,
      );
    }

    const key = transfer.beritaAcaraUrl;
    const filename = key.split('/').pop() || `BAC-${transfer.nomorUsulan}.pdf`;

    // 2. Prepare params untuk digsig
    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
      tanggalDokumen: transfer.tanggalUsulan
        ? new Date(transfer.tanggalUsulan).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: 'Biasa',
      jenisNaskah: 'Berita Acara',
      perihal: `Berita Acara Serah Terima — ${transfer.arsipPerihal}`,
      nik: nik,
      passphrase: dto.passphrase,
      path_dokumen: 'transfer-active-to-inactive/bac-signed/',
      no_wa: noWa,
    };

    // 3. Hit digsig endpoint (BSrE v2 + upload signed PDF ke MinIO)
    const response = await this.hitDigsigEndpoint(params, {
      userPersnum: Number(user.persnum),
      userName: user.nama,
      jenisNaskah: 'BAC',
    });

    // 4. BSrE mengembalikan key file signed di data.name_doc (adapter v2),
    // bukan selalu di root response. Gunakan key aktual agar QR dan preview
    // tidak menunjuk kembali ke PDF BAC sebelum TTE.
    const signedKey =
      (response as any)?.signed_file_path ??
      (response as any)?.data?.name_doc?.[0] ??
      (response as any)?.name_doc?.[0] ??
      null;
    let finalSignedKey = signedKey;

    // BSrE memberi tanda tangan digital, sedangkan QR verifikasi adalah bagian
    // dari alur ArsipKu. Sematkan QR ke PDF hasil BSrE seperti alur naskah
    // digital lain, lalu simpan PDF finalnya sebagai object baru.
    if (signedKey) {
      try {
        const signedAt = new Date().toISOString();
        const signatureId = generateSignatureId();
        const qrData: QRCodeData = {
          signature_id: signatureId,
          document_number:
            transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
          signed_at: signedAt,
          signer_name: (isPihakKedua ? transfer.bacPihakKeduaName : transfer.bacPihakPertamaName) || user.nama || 'Penandatangan',
          signer_jabatan: (isPihakKedua ? transfer.bacPihakKeduaJabatan : transfer.bacPihakPertamaJabatan) || (isPihakKedua ? 'Pejabat Pihak Kedua' : 'Pejabat Pihak Pertama'),
          document_type: 'Berita Acara Pemindahan Arsip',
          verification_url: `${VERIFICATION_BASE_URL}/${signatureId}`,
        };
        const signedBuffer = await this.storageService.getFile(signedKey);
        const qrResult = await this.pdfQrEmbedService.embedQRCodeToPdf(
          signedBuffer,
          qrData,
          // Kolom tanda tangan Pihak Pertama berada di sisi kiri BAC.
          // Jangan memakai posisi default 2/3 halaman karena QR dapat masuk
          // ke area Pihak Kedua.
          {
            // Letakkan pada halaman tanda tangan terakhir. BAC tetap satu
            // halaman pada kondisi normal, tetapi ini aman bila teks meluber
            // menjadi dua halaman.
            useLastPage: true,
            useFixedPosition: true,
            fixedX: isPihakKedua ? 430 : 74,
            fixedY: 86,
            qrSize: 82,
          },
        );
        if (qrResult.success) {
          const qrUpload = await this.storageService.uploadBuffer(
            qrResult.pdfBuffer,
            `BAC-${transfer.nomorUsulan}-signed.pdf`,
            'application/pdf',
            'transfer-active-to-inactive/bac-signed',
          );
          finalSignedKey = qrUpload.key;
          const qr = await this.qrCodeService.generateQRCodeBase64(qrData);
          if (isPihakKedua) transfer.bacPihakKeduaSignatureQr = qr;
          else transfer.bacSignatureQr = qr;
        }
      } catch (qrError) {
        // TTE tetap dianggap berhasil bila BSrE sudah mengembalikan PDF.
        // Simpan versi BSrE sebagai fallback agar dokumen tidak hilang.
        console.error('[DigsigService] Gagal menyematkan QR BAC:', qrError);
      }
    }

    if (finalSignedKey) {
      transfer.beritaAcaraUrl = finalSignedKey;
    }
    if (isPihakKedua) {
      transfer.bacPihakKeduaSignedAt = new Date();
      transfer.bacPihakKeduaSignedBy = Number(user.persnum);
    } else {
      transfer.bacSignedAt = new Date();
      transfer.bacSignedBy = Number(user.persnum);
    }
    await this.transferRepository.save(transfer);
    if (!isPihakKedua) {
      await this.transferActiveToInactiveService.dispatchToTuAfterBacSignature(
        transfer.id,
        user,
      );
    } else {
      await this.transferActiveToInactiveService.dispatchToTuAfterSecondBacSignature(
        transfer.id,
        user,
      );
    }

    return {
      message: 'Berita Acara berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: {
        type: 'digsig',
        doc_id: (response as any)?.doc_id ?? null,
        signed_at: new Date().toISOString(),
        signer_nik: nik,
        path: transfer.beritaAcaraUrl,
      },
    };
  }

  /**
   * Tandatangani BAC dengan QR internal.
   * QR ditempel ke PDF BAC hasil generate sehingga sekretaris, atasan, dan
   * halaman penandatangan selalu membaca file final yang sama.
   */
  async signBacQr(
    transferId: string,
    user: JwtPayload,
    signerType: 'pihak_pertama' | 'pihak_kedua' = 'pihak_pertama',
  ): Promise<SignResultResponse> {
    if (!isEvpOrAbovePosition(user)) {
      throw new ForbiddenException(
        'Penandatanganan BAC hanya dapat dilakukan oleh EVP dan jabatan di atasnya',
      );
    }

    const transfer = await this.transferRepository.findOne({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException(
        `Usulan pemindahan dengan ID ${transferId} tidak ditemukan`,
      );
    }
    if (!transfer.beritaAcaraUrl || transfer.beritaAcaraUrl.endsWith('/berita-acara.pdf')) {
      throw new BadRequestException(
        'Berita Acara belum di-generate. Klik "Generate BAC" terlebih dahulu',
      );
    }
    const isPihakKedua = signerType === 'pihak_kedua';
    if (isPihakKedua && !transfer.bacSignedAt) {
      throw new BadRequestException('Pihak pertama belum menandatangani BAC');
    }
    if (
      isPihakKedua &&
      transfer.status !== 'MENUNGGU_TTD_PIHAK_KEDUA'
    ) {
      throw new BadRequestException(
        'Tanda tangan pihak kedua baru dapat dilakukan setelah seluruh verifikasi TU selesai',
      );
    }
    const alreadySigned = isPihakKedua
      ? transfer.bacPihakKeduaSignedAt
      : transfer.bacSignedAt;
    if (alreadySigned) {
      throw new BadRequestException('Berita Acara ini sudah ditandatangani');
    }
    const assignedPersnum = isPihakKedua
      ? transfer.bacPihakKeduaPersnum
      : transfer.bacPihakPertamaPersnum;
    if (isPihakKedua && !assignedPersnum) {
      throw new BadRequestException('Pejabat pihak kedua BAC belum ditetapkan');
    }
    if (assignedPersnum && Number(assignedPersnum) !== Number(user.persnum)) {
      throw new BadRequestException(
        `Hanya pejabat ${isPihakKedua ? 'pihak kedua' : 'pihak pertama'} BAC yang dapat menandatangani berita acara ini`,
      );
    }
    if (/^(https?:\/\/|\/)/i.test(transfer.beritaAcaraUrl)) {
      throw new BadRequestException(
        'PDF BAC lama tidak dapat ditandatangani. Generate ulang BAC terlebih dahulu',
      );
    }

    const signedAt = new Date();
    const signatureId = generateSignatureId();
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
      signed_at: signedAt.toISOString(),
      signer_name: (isPihakKedua ? transfer.bacPihakKeduaName : transfer.bacPihakPertamaName) || user.nama || 'Penandatangan',
      signer_jabatan: (isPihakKedua ? transfer.bacPihakKeduaJabatan : transfer.bacPihakPertamaJabatan) || (isPihakKedua ? 'Pejabat Pihak Kedua' : 'Pejabat Pihak Pertama'),
      document_type: 'Berita Acara Pemindahan Arsip',
      verification_url: `${VERIFICATION_BASE_URL}/${signatureId}`,
    };

    // QR dirender melalui anchor template BAC setelah label Ttd dan sebelum
    // nama jabatan Pihak Pertama. Ini menghindari posisi QR yang bergeser
    // ketika PDF diberi koordinat berdasarkan halaman secara global.
    const qrCodeDataUrl = await this.qrCodeService.generateQRCodeBase64(qrData);
    const upload = await this.transferActiveToInactiveService.generateSignedBacPdfWithQr(
      transferId,
      qrCodeDataUrl,
      `qr-signed-layout-v6-${isPihakKedua ? 'pihak-kedua' : 'pihak-pertama'}`,
      signerType,
    );
    transfer.beritaAcaraUrl = upload.key;
    if (isPihakKedua) {
      transfer.bacPihakKeduaSignatureQr = qrCodeDataUrl;
      transfer.bacPihakKeduaSignedAt = signedAt;
      transfer.bacPihakKeduaSignedBy = Number(user.persnum);
    } else {
      transfer.bacSignatureQr = qrCodeDataUrl;
      transfer.bacSignedAt = signedAt;
      transfer.bacSignedBy = Number(user.persnum);
    }
    await this.transferRepository.save(transfer);

    await this.digsigLogService.logSignActivity({
      userPersnum: Number(user.persnum),
      userName: user.nama,
      idNaskah: transfer.id,
      nomorNaskah: transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
      jenisNaskah: 'BAC',
      apiEndpoint: '/digsig/bac/:transferId/sign-qr',
      status: 'sukses',
      note: 'BAC ditandatangani dengan QR internal',
    });
    if (!isPihakKedua) {
      await this.transferActiveToInactiveService.dispatchToTuAfterBacSignature(
        transfer.id,
        user,
      );
    } else {
      await this.transferActiveToInactiveService.dispatchToTuAfterSecondBacSignature(
        transfer.id,
        user,
      );
    }

    return {
      message: 'Berita Acara berhasil ditandatangani dengan QR',
      data: {
        status: 'success',
        message: 'QR BAC berhasil dibuat',
        signature_id: signatureId,
        signed_file_path: upload.key,
      },
      signature_metadata: {
        type: 'qr_only',
        doc_id: null,
        signed_at: signedAt.toISOString(),
        signer_nik: String(transfer.bacPihakPertamaPersnum || user.persnum),
        path: upload.key,
      },
    };
  }

  /**
   * Perbaiki BAC QR yang sudah tersimpan dengan layout lama.
   * File lama ditempatkan ulang ke template BAC yang sama, dengan urutan
   * slot tanda tangan: Pihak Pertama -> QR -> jabatan.
   */
  async repairBacQrLayout(
    transferId: string,
    user: JwtPayload,
  ): Promise<SignResultResponse> {
    const transfer = await this.transferRepository.findOne({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException(
        `Usulan pemindahan dengan ID ${transferId} tidak ditemukan`,
      );
    }
    if (!transfer.bacSignedAt) {
      throw new BadRequestException('BAC belum ditandatangani');
    }
    if (
      !transfer.beritaAcaraUrl ||
      !/qr-signed/i.test(transfer.beritaAcaraUrl)
    ) {
      throw new BadRequestException(
        'Perbaikan ini hanya berlaku untuk BAC yang ditandatangani dengan QR',
      );
    }
    const userPersnum = Number(user.persnum);
    const isBacSigner =
      !!transfer.bacPihakPertamaPersnum &&
      Number(transfer.bacPihakPertamaPersnum) === userPersnum;
    const isAssignedManager = [
      transfer.atasanPersnum,
      transfer.approvedBy,
      transfer.finalVerifiedBy,
    ].some((persnum) => Number(persnum) === userPersnum);
    if (!isBacSigner && !isAssignedManager) {
      throw new ForbiddenException(
        'Perbaikan layout BAC hanya dapat dilakukan oleh pejabat penandatangan atau atasan managerial yang ditugaskan',
      );
    }
    if (
      /qr-signed-layout-v6\.pdf$/i.test(transfer.beritaAcaraUrl) &&
      transfer.bacSignatureQr
    ) {
      return {
        message: 'Layout BAC QR sudah sesuai',
        data: {
          status: 'already_normalized',
          message: 'Layout BAC QR sudah sesuai',
          signed_file_path: transfer.beritaAcaraUrl,
        },
        signature_metadata: {
          type: 'qr_only',
          doc_id: null,
          signed_at: transfer.bacSignedAt.toISOString(),
          signer_nik: String(
            transfer.bacPihakPertamaPersnum || transfer.bacSignedBy || '',
          ),
          path: transfer.beritaAcaraUrl,
        },
      };
    }
    const signatureId = generateSignatureId();
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
      signed_at: transfer.bacSignedAt.toISOString(),
      signer_name: transfer.bacPihakPertamaName || 'Penandatangan',
      signer_jabatan:
        transfer.bacPihakPertamaJabatan || 'Pejabat Pihak Pertama',
      document_type: 'Berita Acara Pemindahan Arsip',
      verification_url: `${VERIFICATION_BASE_URL}/${signatureId}`,
    };
    const qrCodeDataUrl = await this.qrCodeService.generateQRCodeBase64(qrData);
    const upload = await this.transferActiveToInactiveService.generateSignedBacPdfWithQr(
      transferId,
      qrCodeDataUrl,
    );

    transfer.beritaAcaraUrl = upload.key;
    transfer.bacSignatureQr = qrCodeDataUrl;
    await this.transferRepository.save(transfer);

    await this.digsigLogService.logSignActivity({
      userPersnum: Number(user.persnum),
      userName: user.nama,
      idNaskah: transfer.id,
      nomorNaskah: transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
      jenisNaskah: 'BAC',
      apiEndpoint: '/digsig/bac/:transferId/repair-qr-layout',
      status: 'sukses',
      note: 'Layout QR BAC dinormalisasi ke template tanda tangan',
    });

    return {
      message: 'Layout BAC QR berhasil diperbaiki',
      data: {
        status: 'success',
        message: 'BAC QR berhasil dirender ulang',
        signature_id: signatureId,
        signed_file_path: upload.key,
      },
      signature_metadata: {
        type: 'qr_only',
        doc_id: null,
        signed_at: transfer.bacSignedAt.toISOString(),
        signer_nik: String(
          transfer.bacPihakPertamaPersnum || transfer.bacSignedBy || '',
        ),
        path: upload.key,
      },
    };
  }

  /**
   * Simpan PDF hasil scan tanda tangan basah sebagai BAC final.
   * File asli tetap dipakai agar tanda tangan fisik benar-benar tercermin pada
   * dokumen yang kemudian dilihat Sekretaris dan Unit Tata Naskah.
   */
  async signBacPhysical(
    transferId: string,
    file: Express.Multer.File,
    user: JwtPayload,
    signerType: 'pihak_pertama' | 'pihak_kedua' = 'pihak_pertama',
  ): Promise<SignResultResponse> {
    if (!isEvpOrAbovePosition(user)) {
      throw new ForbiddenException(
        'Penandatanganan BAC hanya dapat dilakukan oleh EVP dan jabatan di atasnya',
      );
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('File tanda tangan basah harus berformat PDF');
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('Ukuran PDF tanda tangan basah maksimal 20 MB');
    }

    const transfer = await this.transferRepository.findOne({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException(
        `Usulan pemindahan dengan ID ${transferId} tidak ditemukan`,
      );
    }
    if (!transfer.beritaAcaraUrl) {
      throw new BadRequestException('Berita Acara belum di-generate');
    }
    const isPihakKedua = signerType === 'pihak_kedua';
    if (isPihakKedua && !transfer.bacSignedAt) {
      throw new BadRequestException('Pihak pertama belum menandatangani BAC');
    }
    if (
      isPihakKedua &&
      transfer.status !== 'MENUNGGU_TTD_PIHAK_KEDUA'
    ) {
      throw new BadRequestException(
        'Tanda tangan pihak kedua baru dapat dilakukan setelah seluruh verifikasi TU selesai',
      );
    }
    const alreadySigned = isPihakKedua
      ? transfer.bacPihakKeduaSignedAt
      : transfer.bacSignedAt;
    if (alreadySigned) {
      throw new BadRequestException('Berita Acara ini sudah ditandatangani');
    }
    const assignedPersnum = isPihakKedua
      ? transfer.bacPihakKeduaPersnum
      : transfer.bacPihakPertamaPersnum;
    if (isPihakKedua && !assignedPersnum) {
      throw new BadRequestException('Pejabat pihak kedua BAC belum ditetapkan');
    }
    if (assignedPersnum && Number(assignedPersnum) !== Number(user.persnum)) {
      throw new BadRequestException(
        `Hanya pejabat ${isPihakKedua ? 'pihak kedua' : 'pihak pertama'} BAC yang dapat menandatangani berita acara ini`,
      );
    }

    const upload = await this.storageService.uploadBuffer(
      file.buffer,
      `BAC-${transfer.nomorUsulan}-physical-signed.pdf`,
      'application/pdf',
      'transfer-active-to-inactive/bac-signed',
    );
    const signedAt = new Date();
    transfer.beritaAcaraUrl = upload.key;
    if (isPihakKedua) {
      transfer.bacPihakKeduaSignedAt = signedAt;
      transfer.bacPihakKeduaSignedBy = Number(user.persnum);
    } else {
      transfer.bacSignedAt = signedAt;
      transfer.bacSignedBy = Number(user.persnum);
    }
    await this.transferRepository.save(transfer);

    await this.digsigLogService.logSignActivity({
      userPersnum: Number(user.persnum),
      userName: user.nama,
      idNaskah: transfer.id,
      nomorNaskah: transfer.beritaAcaraNomor || `BA/${transfer.nomorUsulan}`,
      jenisNaskah: 'BAC',
      apiEndpoint: '/digsig/bac/:transferId/sign-physical',
      status: 'sukses',
      note: 'BAC ditandatangani dengan tanda tangan basah',
    });
    if (!isPihakKedua) {
      await this.transferActiveToInactiveService.dispatchToTuAfterBacSignature(
        transfer.id,
        user,
      );
    } else {
      await this.transferActiveToInactiveService.dispatchToTuAfterSecondBacSignature(
        transfer.id,
        user,
      );
    }

    return {
      message: 'Berita Acara berhasil ditandatangani dengan tanda tangan basah',
      data: {
        status: 'success',
        message: 'PDF tanda tangan basah tersimpan',
        signed_file_path: upload.key,
      },
      signature_metadata: {
        type: 'ttd_basah',
        doc_id: null,
        signed_at: signedAt.toISOString(),
        signer_nik: String(transfer.bacPihakPertamaPersnum || user.persnum),
        path: upload.key,
      },
    };
  }

  /**
   * Sign Nota Dinas dengan BSrE (NIK dan no_wa dari JWT payload)
   * @param idNaskah - ID dari tabel naskah
   * @param dto - Object containing passphrase dan optional klasifikasi
   * @param user - JwtPayload user yang login (berisi NIK dan noWa)
   */
  async signNotaDinasBsre(
    idNaskah: string,
    dto: { passphrase: string; klasifikasi?: string },
    user: JwtPayload,
  ): Promise<SignResultResponse> {
    console.log(
      `[DigsigService] signNotaDinasBsre - idNaskah: ${idNaskah}, persnum: ${user.persnum}`,
    );

    const nik = DEFAULT_BSRE_NIK;
    const noWa = user.noWa || '';
    console.log(
      `[DigsigService] User data from JWT - NIK: ${nik.substring(0, 4)}****, noWa: ${noWa ? noWa.substring(0, 6) + '****' : '(tidak tersedia)'}`,
    );

    // 2. Cari naskah berdasarkan idNaskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${idNaskah} tidak ditemukan`,
      );
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'ND') {
      throw new BadRequestException('Naskah bukan Nota Dinas');
    }

    // Cari nota dinas berdasarkan id_naskah
    const nd = await this.ndRepository.findOne({ where: { idNaskah } });
    if (!nd) {
      throw new NotFoundException(
        `Nota Dinas dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 3. Prepare params untuk digsig
    const filename = naskah.final_pdf.split('/').pop() || 'document.pdf';
    const key = naskah.final_pdf;

    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: nd.nomor || naskah.nomor || '-',
      tanggalDokumen: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
      jenisNaskah: 'Nota Dinas',
      perihal: nd.perihal || naskah.perihal || '-',
      nik: nik,
      passphrase: dto.passphrase,
      path_dokumen: 'nota-dinas/digsig/',
      no_wa: noWa,
    };

    // 4. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 5. Generate QR Code (BSrE tidak return QR, jadi dibuat internal)
    const signedAt = new Date().toISOString();
    const signatureId = generateSignatureId();
    const documentNumber = nd.nomor || naskah.nomor || '-';
    const signerName = nd.namaLengkap || 'Penandatangan';
    const signerJabatan = nd.namaJabatan || 'Jabatan';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath
      ? this.storageService.getPublicUrl(finalPdfPath)
      : undefined;

    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Nota Dinas',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
      document_id: naskah.id,
    };

    // 6. Regenerate PDF dengan QR code
    try {
      if (finalPdfPath) {
        await this.regenerateNdPdfWithQRCode(naskah, nd, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
      // Continue without QR code if PDF generation fails
    }

    // 7. Update tanda_tangan di ND dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_nik: nik,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    // REFACTOR: Update tandaTangan di nd (backward compat) dan juga di naskah
    await this.ndRepository.update(nd.id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(idNaskah, {
      status: 'final_tte',
      tandaTangan: signatureMetadata, // REFACTOR: Juga simpan di naskah
    });

    return {
      message: 'Nota Dinas berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Sign Surat Dinas Internal dengan BSrE (NIK dan no_wa dari JWT payload)
   * @param idNaskah - ID dari tabel naskah
   * @param dto - Object containing passphrase dan optional klasifikasi
   * @param user - JwtPayload user yang login (berisi NIK dan noWa)
   */
  async signSdiBsre(
    idNaskah: string,
    dto: { passphrase: string; klasifikasi?: string },
    user: JwtPayload,
  ): Promise<SignResultResponse> {
    console.log(
      `[DigsigService] signSdiBsre - idNaskah: ${idNaskah}, persnum: ${user.persnum}`,
    );

    const nik = DEFAULT_BSRE_NIK;
    const noWa = user.noWa || '';
    console.log(
      `[DigsigService] User data from JWT - NIK: ${nik.substring(0, 4)}****, noWa: ${noWa ? noWa.substring(0, 6) + '****' : '(tidak tersedia)'}`,
    );

    // 2. Cari naskah berdasarkan idNaskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${idNaskah} tidak ditemukan`,
      );
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException('Naskah bukan Surat Dinas Internal');
    }

    // Cari SDI berdasarkan id_naskah
    const sdi = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sdi) {
      throw new NotFoundException(
        `Surat Dinas Internal dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 3. Prepare params untuk digsig
    const filename = naskah.final_pdf.split('/').pop() || 'document.pdf';
    const key = naskah.final_pdf;

    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: sdi.nomor || naskah.nomor || '-',
      tanggalDokumen: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
      jenisNaskah: 'Surat Dinas Internal',
      perihal: sdi.perihal || naskah.perihal || '-',
      nik: nik,
      passphrase: dto.passphrase,
      path_dokumen: 'surat-dinas-internal/digsig/',
      no_wa: noWa,
    };

    // 4. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 5. Generate QR Code (BSrE tidak return QR, jadi dibuat internal)
    const signedAt = new Date().toISOString();
    const signatureId = generateSignatureId();
    const documentNumber = sdi.nomor || naskah.nomor || '-';
    const signerName = sdi.namaLengkap || 'Penandatangan';
    const signerJabatan = sdi.namaJabatan || 'Jabatan';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath
      ? this.storageService.getPublicUrl(finalPdfPath)
      : undefined;

    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Internal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
      document_id: naskah.id,
    };

    // 6. Regenerate PDF dengan QR code
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sdi, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // 7. Update tanda_tangan di SDI dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_nik: nik,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    // REFACTOR: Update tandaTangan di sdi_sde (backward compat) dan juga di naskah
    await this.sdiSdeRepository.update(sdi.id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(idNaskah, {
      status: 'final_tte',
      tandaTangan: signatureMetadata, // REFACTOR: Juga simpan di naskah
    });

    return {
      message: 'Surat Dinas Internal berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Sign Surat Dinas Eksternal dengan BSrE (NIK dan no_wa dari JWT payload)
   * @param idNaskah - ID dari tabel naskah
   * @param dto - Object containing passphrase dan optional klasifikasi
   * @param user - JwtPayload user yang login (berisi NIK dan noWa)
   */
  async signSdeBsre(
    idNaskah: string,
    dto: { passphrase: string; klasifikasi?: string },
    user: JwtPayload,
  ): Promise<SignResultResponse> {
    console.log(
      `[DigsigService] signSdeBsre - idNaskah: ${idNaskah}, persnum: ${user.persnum}`,
    );

    const nik = DEFAULT_BSRE_NIK;
    const noWa = user.noWa || '';
    console.log(
      `[DigsigService] User data from JWT - NIK: ${nik.substring(0, 4)}****, noWa: ${noWa ? noWa.substring(0, 6) + '****' : '(tidak tersedia)'}`,
    );

    // 2. Cari naskah berdasarkan idNaskah

    // 2. Cari naskah berdasarkan idNaskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${idNaskah} tidak ditemukan`,
      );
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal');
    }

    // Cari SDE berdasarkan id_naskah
    const sde = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sde) {
      throw new NotFoundException(
        `Surat Dinas Eksternal dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 3. Prepare params untuk digsig
    const filename = naskah.final_pdf.split('/').pop() || 'document.pdf';
    const key = naskah.final_pdf;

    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: sde.nomor || naskah.nomor || '-',
      tanggalDokumen: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
      jenisNaskah: 'Surat Dinas Eksternal',
      perihal: sde.perihal || naskah.perihal || '-',
      nik: nik,
      passphrase: dto.passphrase,
      path_dokumen: 'surat-dinas-eksternal/digsig/',
      no_wa: noWa,
    };

    // 4. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 5. Generate QR Code (BSrE tidak return QR, jadi dibuat internal)
    const signedAt = new Date().toISOString();
    const signatureId = generateSignatureId();
    const documentNumber = sde.nomor || naskah.nomor || '-';
    const signerName = sde.namaLengkap || 'Penandatangan';
    const signerJabatan = sde.namaJabatan || 'Jabatan';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath
      ? this.storageService.getPublicUrl(finalPdfPath)
      : undefined;

    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Eksternal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
      document_id: naskah.id,
    };

    // 6. Regenerate PDF dengan QR code
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sde, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // 7. Update tanda_tangan di SDE dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_nik: nik,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    // REFACTOR: Update tandaTangan di sdi_sde (backward compat) dan juga di naskah
    await this.sdiSdeRepository.update(sde.id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(idNaskah, {
      status: 'final_tte',
      tandaTangan: signatureMetadata, // REFACTOR: Juga simpan di naskah
    });

    return {
      message: 'Surat Dinas Eksternal berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  // ============================================
  // SIGN INTERNAL (Tanpa BSrE) - Untuk Testing
  // ============================================

  /**
   * Sign Nota Dinas dengan Internal (tanpa BSrE)
   * @param idNaskah - ID dari tabel naskah
   */
  async signNotaDinasInternal(
    idNaskah: string,
    dto: { passphrase: string },
  ): Promise<SignInternalResultResponse> {
    // Validasi passphrase
    if (dto.passphrase !== DEFAULT_PASSPHRASE) {
      throw new BadRequestException('Passphrase tidak valid');
    }

    // Cari naskah terlebih dahulu
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${idNaskah} tidak ditemukan`,
      );
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'ND') {
      throw new BadRequestException('Naskah bukan Nota Dinas');
    }

    // Cari nota dinas berdasarkan id_naskah
    const nd = await this.ndRepository.findOne({ where: { idNaskah } });
    if (!nd) {
      throw new NotFoundException(
        `Nota Dinas dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    // Generate signature ID dan metadata
    const signatureId = generateSignatureId();
    const signedAt = new Date().toISOString();
    const signerName = nd.namaLengkap || 'Penandatangan';
    const signerJabatan = nd.namaJabatan || 'Jabatan';
    const documentNumber = nd.nomor || naskah.nomor || '-';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

    // Get public URL untuk final PDF
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath
      ? this.storageService.getPublicUrl(finalPdfPath)
      : undefined;

    // Generate QR Code untuk signature - langsung ke PDF
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Nota Dinas',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
      document_id: naskah.id, // QR code langsung ke dokumen PDF
    };

    // Generate PDF baru dengan QR code - overwrite final_pdf
    try {
      if (finalPdfPath) {
        await this.regenerateNdPdfWithQRCode(naskah, nd, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
      // Continue without QR code if PDF generation fails
    }

    // Update tanda_tangan dan status (tetap final_pdf)
    const signatureMetadata = formatSignatureData({
      type: 'internal',
      signature_id: signatureId,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    // REFACTOR: Update tandaTangan di nd (backward compat) dan juga di naskah
    await this.ndRepository.update(nd.id, {
      tandaTangan: signatureMetadata,
    });

    // REFACTOR: Juga update tandaTangan di naskah
    await this.naskahRepository.update(idNaskah, {
      tandaTangan: signatureMetadata,
    });

    // Status tetap final_pdf (tidak berubah)
    // Hanya update tanda_tangan

    return {
      message: 'Nota Dinas berhasil ditandatangani (Internal)',
      signature_metadata: {
        type: 'internal',
        signature_id: signatureId,
        signed_at: signedAt,
        signer_id: null, // TODO: dari user profile
        signer_name: signerName,
        signer_jabatan: signerJabatan,
        path: finalPdfPath,
      },
    };
  }

  /**
   * Sign Surat Dinas Internal dengan Internal (tanpa BSrE)
   * @param idNaskah - ID dari tabel naskah
   */
  async signSdiInternal(
    idNaskah: string,
    dto: { passphrase: string },
  ): Promise<SignInternalResultResponse> {
    // Validasi passphrase
    if (dto.passphrase !== DEFAULT_PASSPHRASE) {
      throw new BadRequestException('Passphrase tidak valid');
    }

    // Cari naskah terlebih dahulu
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${idNaskah} tidak ditemukan`,
      );
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException('Naskah bukan Surat Dinas Internal');
    }

    // Cari SDI berdasarkan id_naskah
    const sdi = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sdi) {
      throw new NotFoundException(
        `Surat Dinas Internal dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    // Generate signature ID dan metadata
    const signatureId = generateSignatureId();
    const signedAt = new Date().toISOString();
    const signerName = sdi.namaLengkap || 'Penandatangan';
    const signerJabatan = sdi.namaJabatan || 'Jabatan';
    const documentNumber = sdi.nomor || naskah.nomor || '-';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

    // Get public URL untuk final PDF
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath
      ? this.storageService.getPublicUrl(finalPdfPath)
      : undefined;

    // Generate QR Code untuk signature - langsung ke PDF
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Internal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
      document_id: naskah.id,
    };

    // Generate PDF baru dengan QR code - overwrite final_pdf
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sdi, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // Update tanda_tangan
    const signatureMetadata = formatSignatureData({
      type: 'internal',
      signature_id: signatureId,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    // REFACTOR: Update tandaTangan di sdi_sde (backward compat) dan juga di naskah
    await this.sdiSdeRepository.update(sdi.id, {
      tandaTangan: signatureMetadata,
    });

    // REFACTOR: Juga update tandaTangan di naskah
    await this.naskahRepository.update(idNaskah, {
      tandaTangan: signatureMetadata,
    });

    // Status tetap final_pdf (tidak berubah)

    return {
      message: 'Surat Dinas Internal berhasil ditandatangani (Internal)',
      signature_metadata: {
        type: 'internal',
        signature_id: signatureId,
        signed_at: signedAt,
        signer_id: null,
        signer_name: signerName,
        signer_jabatan: signerJabatan,
        path: finalPdfPath,
      },
    };
  }

  /**
   * Sign Surat Dinas Eksternal dengan Internal (tanpa BSrE)
   * @param idNaskah - ID dari tabel naskah
   */
  async signSdeInternal(
    idNaskah: string,
    dto: { passphrase: string },
  ): Promise<SignInternalResultResponse> {
    // Validasi passphrase
    if (dto.passphrase !== DEFAULT_PASSPHRASE) {
      throw new BadRequestException('Passphrase tidak valid');
    }

    // Cari naskah terlebih dahulu
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${idNaskah} tidak ditemukan`,
      );
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal');
    }

    // Cari SDE berdasarkan id_naskah
    const sde = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sde) {
      throw new NotFoundException(
        `Surat Dinas Eksternal dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    // Generate signature ID dan metadata
    const signatureId = generateSignatureId();
    const signedAt = new Date().toISOString();
    const signerName = sde.namaLengkap || 'Penandatangan';
    const signerJabatan = sde.namaJabatan || 'Jabatan';
    const documentNumber = sde.nomor || naskah.nomor || '-';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

    // Get public URL untuk final PDF
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath
      ? this.storageService.getPublicUrl(finalPdfPath)
      : undefined;

    // Generate QR Code untuk signature - langsung ke PDF
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Eksternal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
      document_id: naskah.id,
    };

    // Generate PDF baru dengan QR code - overwrite final_pdf
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sde, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // Update tanda_tangan
    const signatureMetadata = formatSignatureData({
      type: 'internal',
      signature_id: signatureId,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    // REFACTOR: Update tandaTangan di sdi_sde (backward compat) dan juga di naskah
    await this.sdiSdeRepository.update(sde.id, {
      tandaTangan: signatureMetadata,
    });

    // REFACTOR: Juga update tandaTangan di naskah
    await this.naskahRepository.update(idNaskah, {
      tandaTangan: signatureMetadata,
    });

    // Status tetap final_pdf (tidak berubah)

    return {
      message: 'Surat Dinas Eksternal berhasil ditandatangani (Internal)',
      signature_metadata: {
        type: 'internal',
        signature_id: signatureId,
        signed_at: signedAt,
        signer_id: null,
        signer_name: signerName,
        signer_jabatan: signerJabatan,
        path: finalPdfPath,
      },
    };
  }
  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Helper: Format tanggal ke format Indonesia (e.g., "29 Desember 2025")
   * Sama dengan format yang digunakan di surat-dinas-internal.service.ts
   */
  private formatDateToIndonesian(date: Date): string {
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
  }

  /**
   * Helper: Get dynamic header info dari sub_area_alamat berdasarkan naskah_sirkulasi pengirim
   * @param idNaskah - ID naskah untuk mencari pengirim di naskah_sirkulasi
   * @param tanggal - Optional tanggal dari naskah
   * @returns Header info (kantor, gedung, alamat, kota) atau null
   */
  private async getHeaderInfoFromNaskah(
    idNaskah: string,
    tanggal?: Date,
  ): Promise<{
    kantor: string;
    gedung: string;
    alamat: string;
    kota: string;
  } | null> {
    try {
      // Get pengirim dari naskah_sirkulasi
      const pengirim = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: idNaskah,
          sirkuler: 'pengirim',
        },
      });

      if (!pengirim) {
        console.log(
          '[DigsigService getHeaderInfo] Pengirim not found in naskah_sirkulasi',
        );
        return null;
      }

      const company = String(pengirim.company || COMPANY_ID);
      const area = pengirim.area || '';
      const subArea = pengirim.subArea || '';

      if (!area || !subArea) {
        console.log(
          '[DigsigService getHeaderInfo] Missing area or subArea, using default',
        );
        return null;
      }

      const queryDate = tanggal || new Date();

      const headerInfo =
        await this.subAreaAlamatService.findAlamatByUserContext(
          company,
          area,
          subArea,
          queryDate,
        );

      if (headerInfo) {
        console.log(
          '[DigsigService getHeaderInfo] Found header info:',
          headerInfo,
        );
        return headerInfo;
      }

      console.log(
        '[DigsigService getHeaderInfo] No header info found, using default',
      );
      return null;
    } catch (error) {
      console.error('[DigsigService getHeaderInfo] Error:', error);
      return null;
    }
  }

  /**
   * Regenerate Nota Dinas PDF dengan QR Code signature
   * Menggunakan template generate_pdf_nodin dan overwrite final_pdf
   */
  private async regenerateNdPdfWithQRCode(
    naskah: NaskahEntity,
    nd: NdEntity,
    qrData: QRCodeData,
  ): Promise<void> {
    // Generate QR code base64
    const qrCodeBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);

    // Generate QR code HTML untuk di dalam section TTD
    const qrCodeHtml = this.generateQRCodeForTTD(qrCodeBase64, qrData);

    // Get dynamic header info dari sub_area_alamat berdasarkan pengirim di naskah_sirkulasi
    const tanggalNaskah = naskah.tanggal
      ? new Date(naskah.tanggal)
      : new Date();
    const headerInfo = await this.getHeaderInfoFromNaskah(
      naskah.id,
      tanggalNaskah,
    );

    // Parse tertuju/penerima
    let tertuju: string[] = [];
    if (nd.kepadaYth) {
      try {
        tertuju = JSON.parse(nd.kepadaYth);
      } catch {
        tertuju = [nd.kepadaYth];
      }
    }

    // Parse tembusan
    let tembusan: string[] = [];
    if (nd.tembusan) {
      try {
        tembusan = JSON.parse(nd.tembusan);
      } catch {
        tembusan = nd.tembusan ? [nd.tembusan] : [];
      }
    }

    // Format tanggal sama dengan send message (format Indonesia)
    const tanggalFormatted = this.formatDateToIndonesian(tanggalNaskah);

    // Prepare options untuk generate PDF menggunakan generate_pdf_nodin
    const pdfOptions = {
      html: nd.konten || naskah.konten || '',
      perihal: nd.perihal || naskah.perihal || '',
      dari: nd.dari || '',
      namaLengkap: nd.namaLengkap || '',
      positionText: nd.namaJabatan || '',
      nomor: nd.nomor || naskah.nomor || '',
      tanggal: tanggalFormatted,
      nama_tempat: headerInfo?.kota || nd.namaTempat || 'Tangerang',
      tertuju: tertuju,
      tembusan: tembusan,
      qrCodeHtml: qrCodeHtml, // QR code untuk section TTD
      // Dynamic header info dari sub_area_alamat
      headerKantor: headerInfo?.kantor,
      headerGedung: headerInfo?.gedung,
      headerAlamat: headerInfo?.alamat,
    };

    // Generate PDF menggunakan GeneratePdfNodinService
    const pdfBuffer =
      await this.generatePdfNodinService.generatePdf(pdfOptions);

    // Overwrite file di storage (gunakan path yang sama)
    const finalPdfPath = naskah.final_pdf;
    if (finalPdfPath) {
      await this.storageService.deleteFile(finalPdfPath).catch(() => {});

      // Extract folder dan filename dari path
      const pathParts = finalPdfPath.split('/');
      const filename = pathParts.pop() || `${naskah.id}.pdf`;
      const folder = pathParts.join('/');

      // Upload dengan key yang sama
      await this.storageService.uploadBuffer(
        pdfBuffer,
        filename,
        'application/pdf',
        folder,
      );
    }
  }

  /**
   * Regenerate SDI/SDE PDF dengan QR Code signature
   * Menggunakan template generate_pdf_sudin dan overwrite final_pdf
   */
  private async regenerateSdiSdePdfWithQRCode(
    naskah: NaskahEntity,
    sdiSde: SdiSdeEntity,
    qrData: QRCodeData,
  ): Promise<void> {
    // Generate QR code base64
    const qrCodeBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);

    // Generate QR code HTML untuk di section TTD (simpel, hanya gambar QR centered)
    const qrCodeHtml = this.generateQRCodeForTTD(qrCodeBase64, qrData);

    // Get dynamic header info dari sub_area_alamat berdasarkan pengirim di naskah_sirkulasi
    const tanggalNaskah = naskah.tanggal
      ? new Date(naskah.tanggal)
      : new Date();
    const headerInfo = await this.getHeaderInfoFromNaskah(
      naskah.id,
      tanggalNaskah,
    );

    // Get konten (tanpa append QR ke body - QR akan ditampilkan di TTD section)
    const konten = sdiSde.konten || naskah.konten || '';

    // Parse penerima
    let penerima: string[] = [];
    if (sdiSde.kepadaYth) {
      try {
        penerima = JSON.parse(sdiSde.kepadaYth);
      } catch {
        penerima = [sdiSde.kepadaYth];
      }
    }

    // Parse tembusan
    let tembusan: string[] = [];
    if (sdiSde.tembusan) {
      try {
        tembusan = JSON.parse(sdiSde.tembusan);
      } catch {
        tembusan = sdiSde.tembusan ? [sdiSde.tembusan] : [];
      }
    }

    // Format tanggal sama dengan send message (format Indonesia)
    const tanggalFormatted = this.formatDateToIndonesian(tanggalNaskah);

    // Prepare options untuk generate PDF
    const pdfOptions = {
      html: Buffer.from(konten, 'utf-8').toString('base64'),
      perihal: sdiSde.perihal || naskah.perihal || '',
      namaLengkap: sdiSde.namaLengkap || '',
      positionText: sdiSde.namaJabatan || '',
      nomor: sdiSde.nomor || naskah.nomor || '',
      tanggal: tanggalFormatted,
      nama_tempat: headerInfo?.kota || sdiSde.namaTempat || 'Tangerang',
      nama_jabatan: sdiSde.namaJabatan || '',
      sifat: sdiSde.sifat || 'Biasa',
      lampiran: sdiSde.lampiran || '-',
      penerima: penerima,
      tembusan: tembusan,
      qrCodeHtml: qrCodeHtml, // QR code akan ditampilkan di TTD section
      // Dynamic header info dari sub_area_alamat
      headerKantor: headerInfo?.kantor,
      headerGedung: headerInfo?.gedung,
      headerAlamat: headerInfo?.alamat,
    };

    // Generate PDF menggunakan GeneratePdfSudinService
    const pdfBuffer =
      await this.generatePdfSudinService.generatePdf(pdfOptions);

    // Overwrite file di storage (gunakan path yang sama)
    const finalPdfPath = naskah.final_pdf;
    if (finalPdfPath) {
      await this.storageService.deleteFile(finalPdfPath).catch(() => {});

      // Extract folder dan filename dari path
      const pathParts = finalPdfPath.split('/');
      const filename = pathParts.pop() || `${naskah.id}.pdf`;
      const folder = pathParts.join('/');

      // Upload dengan key yang sama
      await this.storageService.uploadBuffer(
        pdfBuffer,
        filename,
        'application/pdf',
        folder,
      );
    }
  }

  /**
   * Generate QR Code HTML khusus untuk section TTD (Nota Dinas)
   * Posisi di antara nama jabatan dan nama lengkap
   * Hanya tampilkan QR code tanpa detail text - centered
   */
  private generateQRCodeForTTD(qrDataUrl: string, _data: QRCodeData): string {
    return `
      <div style="text-align: center; margin: 10px 0;">
        <img src="${qrDataUrl}" style="width: 100px; height: 100px;" />
      </div>
    `;
  }

  // ============================================
  // VERIFICATION METHODS
  // ============================================

  /**
   * Verifikasi dokumen berdasarkan signature_id
   * Mencari di tabel nd dan sdi_sde
   */
  /** Public QR resolves the current completed PDF, including Portal replacement. */
  async getFinalPdfForQr(id: string, reference: string): Promise<Buffer> {
    const naskah = await this.naskahRepository.findOne({ where: { id } });
    if (
      !naskah ||
      !naskah.nomor ||
      reference !== finalPdfQrReference(id, naskah.nomor) ||
      !['final', 'final_tte'].includes(naskah.status) ||
      !naskah.final_pdf
    ) {
      throw new NotFoundException('PDF final naskah belum tersedia');
    }
    if (naskah.tandaTangan) {
      try {
        const metadata = JSON.parse(naskah.tandaTangan) as Record<string, unknown>;
        if (metadata.mode === 'portal' && !metadata.signed_at) {
          throw new Error('Portal signing incomplete');
        }
      } catch {
        throw new NotFoundException('PDF final naskah belum tersedia');
      }
    }
    return this.storageService.getFile(naskah.final_pdf);
  }

  async verifyBySignatureId(signatureId: string): Promise<{
    valid: boolean;
    document?: {
      type: string;
      nomor: string;
      perihal: string;
      tanggal: string;
      signed_at: string;
      signer_name: string;
      signer_jabatan: string;
      status: string;
    };
    message: string;
  }> {
    try {
      if (/^portal-[a-f0-9]{64}$/.test(signatureId)) {
        const naskah = await this.naskahRepository.findOne({
          where: { tandaTangan: Like(`%"signature_id":"${signatureId}"%`) },
        });
        if (!naskah || naskah.status !== 'final_tte' || !naskah.final_pdf || !naskah.tandaTangan) {
          return { valid: false, message: 'Naskah belum selesai ditandatangani atau referensi QR tidak ditemukan' };
        }
        const metadata = JSON.parse(naskah.tandaTangan) as Record<string, unknown>;
        if (metadata.mode !== 'portal' || metadata.signature_id !== signatureId || !metadata.signed_at) {
          return { valid: false, message: 'Referensi tanda tangan Portal TTE tidak valid' };
        }
        return {
          valid: true,
          document: {
            type: naskah.jenis, nomor: naskah.nomor || '', perihal: naskah.perihal || '',
            tanggal: naskah.tanggal instanceof Date ? naskah.tanggal.toISOString().split('T')[0] : String(naskah.tanggal),
            signed_at: String(metadata.signed_at), signer_name: String(metadata.signer_name || ''),
            signer_jabatan: String(metadata.signer_jabatan || ''), status: naskah.status,
          },
          message: 'Naskah telah selesai ditandatangani melalui Portal TTE',
        };
      }

      // Search in ND table
      const ndList = await this.ndRepository
        .createQueryBuilder('nd')
        .where('nd.tandaTangan LIKE :pattern', { pattern: `%${signatureId}%` })
        .getMany();

      if (ndList.length > 0) {
        const nd = ndList[0];
        const metadata = JSON.parse(nd.tandaTangan || '{}');

        // Get naskah status
        const naskah = nd.idNaskah
          ? await this.naskahRepository.findOne({ where: { id: nd.idNaskah } })
          : null;

        return {
          valid: true,
          document: {
            type: 'Nota Dinas',
            nomor: nd.nomor || '',
            perihal: nd.perihal || '',
            tanggal: nd.tanggal?.toISOString().split('T')[0] || '',
            signed_at: metadata.signed_at || '',
            signer_name: metadata.signer_name || nd.namaLengkap || '',
            signer_jabatan: metadata.signer_jabatan || nd.namaJabatan || '',
            status: naskah?.status || 'unknown',
          },
          message: 'Dokumen valid dan telah ditandatangani secara digital',
        };
      }

      // Search in SDI/SDE table
      const sdiList = await this.sdiSdeRepository
        .createQueryBuilder('sdi')
        .where('sdi.tandaTangan LIKE :pattern', { pattern: `%${signatureId}%` })
        .getMany();

      if (sdiList.length > 0) {
        const sdi = sdiList[0];
        const metadata = JSON.parse(sdi.tandaTangan || '{}');

        // Get naskah info
        const naskah = sdi.idNaskah
          ? await this.naskahRepository.findOne({ where: { id: sdi.idNaskah } })
          : null;
        const docType =
          naskah?.jenis === 'SDE'
            ? 'Surat Dinas Eksternal'
            : 'Surat Dinas Internal';

        return {
          valid: true,
          document: {
            type: docType,
            nomor: sdi.nomor || '',
            perihal: sdi.perihal || '',
            tanggal: sdi.tanggal?.toISOString().split('T')[0] || '',
            signed_at: metadata.signed_at || '',
            signer_name: metadata.signer_name || sdi.namaLengkap || '',
            signer_jabatan: metadata.signer_jabatan || sdi.namaJabatan || '',
            status: naskah?.status || 'unknown',
          },
          message: 'Dokumen valid dan telah ditandatangani secara digital',
        };
      }

      return {
        valid: false,
        message: 'Dokumen dengan signature ID tersebut tidak ditemukan',
      };
    } catch (error) {
      return {
        valid: false,
        message: `Error verifikasi: ${error.message}`,
      };
    }
  }

  /**
   * Verifikasi dokumen dengan BSrE menggunakan name_doc
   * name_doc adalah nama file yang dikembalikan oleh BSrE saat signing
   *
   * API v2: verify menerima base64 PDF langsung (bukan name_doc).
   * Strategi: cari file di MinIO berdasarkan name_doc, lalu kirim base64-nya.
   */
  async verifyWithBsre(nameDoc: string): Promise<{
    valid: boolean;
    bsre_response?: any;
    message: string;
  }> {
    try {
      if (!nameDoc) {
        return {
          valid: false,
          message: 'name_doc tidak boleh kosong',
        };
      }

      // API v2 tidak lagi menyimpan dokumen di server BSrE.
      // Ambil file dari MinIO (path yang sama dengan hasil signing), lalu
      // kirim base64-nya ke endpoint verify v2.
      let fileB64: string | null = null;
      const candidatePaths = [
        `nota-dinas/digsig/${nameDoc}`,
        `surat-dinas-internal/digsig/${nameDoc}`,
        `surat-dinas-eksternal/digsig/${nameDoc}`,
        `kajian/digsig/${nameDoc}`,
        `disposisi/digsig/${nameDoc}`,
        `digsig-document/signed/${nameDoc}`,
      ];
      for (const p of candidatePaths) {
        try {
          const buf = await this.storageService.getFile(p);
          fileB64 = buf.toString('base64');
          break;
        } catch {
          // coba path berikutnya
        }
      }

      if (!fileB64) {
        return {
          valid: false,
          message: `File ${nameDoc} tidak ditemukan di storage untuk verifikasi`,
        };
      }

      // Hit BSrE verify API v2 — payload { file: "<base64>" } (string, bukan array)
      const response = await axios.post(
        this.BSRE_VERIFY_URL,
        { file: fileB64 },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.BSRE_BASIC_AUTH_HEADER,
          },
          timeout: 30000,
        },
      );

      // Parse response dari BSrE v2
      const bsreData = response.data;
      const conclusion = bsreData?.conclusion;

      if (conclusion === 'VALID' || conclusion === 'WARNING') {
        return {
          valid: true,
          bsre_response: bsreData,
          message:
            bsreData?.description || 'Dokumen valid dan terdaftar di BSrE',
        };
      }

      return {
        valid: false,
        bsre_response: bsreData,
        message:
          bsreData?.description ||
          bsreData?.error ||
          'Dokumen tidak valid atau tidak terdaftar di BSrE',
      };
    } catch (error: any) {
      console.error('[DigsigService] BSrE verify error:', error.message);

      if (axios.isAxiosError(error)) {
        return {
          valid: false,
          bsre_response: error.response?.data,
          message:
            error.response?.data?.error ||
            error.response?.data?.message ||
            'Gagal verifikasi dengan BSrE',
        };
      }

      return {
        valid: false,
        message: `Error verifikasi: ${error.message}`,
      };
    }
  }

  async hitVerifyDigsig(params: VerifyDigsigParams) {
    try {
      console.log('[DigsigService] hitDigsigVerify - Starting...');
      const filename = params.filename;
      const fileurl = params.fileurl;

      // API v2: verify menerima base64 PDF langsung, bukan URL.
      // Ambil file dari MinIO lalu kirim base64-nya.
      const buffer = await this.storageService.getFile(fileurl);
      const fileB64 = buffer.toString('base64');

      // 2. Payload sesuai spesifikasi API v2 — file berupa STRING base64
      const payload = {
        filename,
        file: fileB64,
      };

      // 3. Hit endpoint (Basic Auth)
      const response = await axios.post(this.BSRE_VERIFY_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.BSRE_BASIC_AUTH_HEADER,
        },
        timeout: 30000,
      });

      console.log('[DigsigService] BSrE Response:', response.data);
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('[DigsigService] Axios Error Message:', error.message);
        console.error('[DigsigService] Status:', error.response?.status);
        console.error(
          '[DigsigService] Response Data:',
          JSON.stringify(error.response?.data, null, 2),
        );
        console.error('[DigsigService] Request URL:', error.config?.url);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            source: 'external-service',
            detail: error.response?.data,
          },
          status,
        );
      }
      console.error('[DigsigService] Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
