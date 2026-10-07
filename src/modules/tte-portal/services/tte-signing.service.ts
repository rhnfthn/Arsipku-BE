import {
  Injectable,
  Optional,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { StorageService } from '../../storage/services/storage.service';
import { DigsigLogService } from '../../digsig/services/digsig-log.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  TtePortalClientService,
  TteExchangeResponse,
} from './tte-portal-client.service';
import { TteCompletionDispatcher } from './tte-completion-dispatcher.service';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import {
  TteSignerIdentityService,
  resolveTteDigsigMode,
} from './tte-signer-identity.service';

import { TteCorrespondenceLifecycleService } from './tte-correspondence-lifecycle.service';

/**
 * Contract completion handler — dipanggil setelah callback portal sukses &
 * PDF signed tersimpan di MinIO. Implementasi: TteCompletionDispatcher
 * (memilih handler NU/NL sesuai jenis naskah transaksi).
 */
export interface TteCompletionHandler {
  /**
   * Selesaikan naskah setelah TTE portal sukses.
   * @param transaction Transaksi signing (idNaskah, jenisNaskah, signedFilePath)
   * @param signedFilePath Key PDF TTE di MinIO Arsipku
   */
  completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void>;
  failSigning?(
    transaction: TteSigningTransactionEntity,
    message: string,
  ): Promise<void>;
}

/**
 * Orchestrator alur signing via Portal TTE.
 *
 * Alur (docs/TTE-Digsig/dokumentasi-integrasi-client-portal-tte.md §3):
 * 1. createSigningTransaction: presign → PUT → complete → create request
 *    → persist transaksi → return signing_url (FE redirect browser ke portal)
 * 2. User input passphrase di halaman Portal TTE (TIDAK di aplikasi ini)
 * 3. Portal redirect browser ke redirect_url?code=...&state=...
 * 4. FE callback page → BE handleCallback: validasi state constant-time,
 *    one-time guard, exchange code (<2 menit, single-use)
 * 5. Download PDF signed sebelum URL expired (TTL ~300s) → upload ke MinIO
 *    Arsipku {path_dokumen} (pola adapter sama dengan mode bsre_direct)
 * 6. getTransactionStatus: rekonsiliasi via GET status portal
 */

export interface CreateSigningTransactionParams {
  /** Key PDF asli di MinIO Arsipku */
  sourceKey: string;
  /** Nama file PDF (harus .pdf) */
  filename: string;
  /** Folder tujuan MinIO untuk hasil signed ({path_dokumen} mode lama) */
  pathDokumen: string;
  /** Konteks naskah untuk audit */
  idNaskah?: string;
  jenisNaskah?: string;
  nomorNaskah?: string;
  /** Location & reason dikirim ke proses signing portal */
  location: string;
  reason: string;
  /** Mode tampilan signature */
  tampilan?: 'INVISIBLE' | 'VISIBLE';
  tag?: string;
  jenisTtdVisual?: 'image' | 'qrcode' | 'qrcode_image';
  signatureWidth?: number;
  signatureHeight?: number;
  /** User dari JWT — identitas aktor tetap mengikuti pengguna login */
  user: JwtPayload;
  ipAddress?: string;
}

export interface CreateSigningTransactionResult {
  transactionId: string;
  requestId: string;
  signingUrl: string;
  status: string;
  expiresAt: string;
}

export interface CreateSigningBatchParams {
  documents: Array<Omit<CreateSigningTransactionParams, 'user'>>;
  user: JwtPayload;
}

export interface CallbackResult {
  transactionId: string;
  requestId: string;
  status: string;
  message: string;
}

export interface TteTransactionStatusResult {
  id: string;
  idNaskah: string | null;
  jenisNaskah: string | null;
  nomorNaskah: string | null;
  requestId: string | null;
  status: string;
  openedAt: Date | null;
  processingAt: Date | null;
  signedAt: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  completionError: string | null;
}

@Injectable()
export class TteSigningService {
  private readonly logger = new Logger(TteSigningService.name);

  constructor(
    private readonly portalClient: TtePortalClientService,
    private readonly storageService: StorageService,
    private readonly digsigLogService: DigsigLogService,
    private readonly signerIdentityService: TteSignerIdentityService,
    @InjectRepository(TteSigningTransactionEntity)
    private readonly transactionRepository: Repository<TteSigningTransactionEntity>,
    private readonly completionDispatcher: TteCompletionDispatcher,
    @Optional()
    private readonly correspondenceLifecycle?: TteCorrespondenceLifecycleService,
  ) {}

  /**
   * Langkah 1–4: siapkan dokumen di portal + buat signing request.
   * Return signing_url untuk FE redirect browser user ke Portal TTE.
   */
  async createSigningTransaction(
    params: CreateSigningTransactionParams,
  ): Promise<CreateSigningTransactionResult> {
    const user = params.user;

    // Resolve once so identity and the Portal payload use the same mode.
    const digsigMode = resolveTteDigsigMode();
    const signerNik = await this.signerIdentityService.getNik(
      user.persnum,
      user.sessionId,
      digsigMode,
    );

    const redirectUrl = process.env.TTE_REDIRECT_URL;
    if (!redirectUrl) {
      throw new BadRequestException(
        'TTE_REDIRECT_URL belum dikonfigurasi di server',
      );
    }

    // 1. Ambil PDF asli dari MinIO Arsipku
    const pdfBuffer = await this.storageService.getFile(params.sourceKey);
    TtePortalClientService.assertPdf(pdfBuffer, 'Dokumen sumber TTE');
    const sha256 = TtePortalClientService.sha256Hex(pdfBuffer);

    const transactionId = uuidv4();
    const state = TtePortalClientService.generateState();
    const presignIdempotencyKey =
      TtePortalClientService.generateIdempotencyKey();
    const signingIdempotencyKey =
      TtePortalClientService.generateIdempotencyKey();

    // Persist transaksi + idempotency key SEBELUM mutasi pertama ke portal.
    const transaction = await this.transactionRepository.save(
      this.transactionRepository.create({
        id: transactionId,
        idNaskah: params.idNaskah || null,
        jenisNaskah: params.jenisNaskah || null,
        nomorNaskah: params.nomorNaskah || null,
        userPersnum: user.persnum,
        userName: user.nama || null,
        signerNik,
        signerName: user.nama || null,
        uploadId: null,
        presignIdempotencyKey,
        signingIdempotencyKey,
        sourceKey: params.sourceKey,
        sourceSha256: sha256,
        uploadStatus: 'PENDING',
        pathDokumen: params.pathDokumen,
        redirectUrl,
        tampilan: params.tampilan || 'INVISIBLE',
        digsigMode,
        state,
        status: 'PENDING',
      }),
    );

    try {
      // 2. Presign — daftarkan metadata PDF ke portal.
      const presign = await this.portalClient.presignUpload({
        filename: params.filename,
        size: pdfBuffer.length,
        sha256,
        idempotencyKey: presignIdempotencyKey,
      });
      await this.transactionRepository.update(transaction.id, {
        uploadId: presign.upload_id,
        uploadStatus: presign.status,
      });

      // 3. Upload raw PDF ke object storage portal (required_headers persis)
      await this.portalClient.uploadPdfToStorage(presign, pdfBuffer);

      // 4. Complete — portal verifikasi size/magic bytes/SHA-256
      const complete = await this.portalClient.completeUpload(
        presign.upload_id,
      );
      if (complete.status !== 'VERIFIED') {
        throw new BadRequestException(
          `Upload portal tidak terverifikasi (status: ${complete.status})`,
        );
      }
      await this.transactionRepository.update(transaction.id, {
        uploadStatus: complete.status,
      });

      // 5. Create signing request — state anti-CSRF dibuat BE
      const request = await this.portalClient.createSigningRequest(
        {
          upload_id: presign.upload_id,
          redirect_url: redirectUrl,
          state,
          tampilan: params.tampilan || 'INVISIBLE',
          ...(params.tampilan === 'VISIBLE'
            ? {
                tag: params.tag,
                jenis_ttd_visual: params.jenisTtdVisual,
                signature_width: params.signatureWidth,
                signature_height: params.signatureHeight,
              }
            : {}),
          location: params.location,
          reason: params.reason,
          signer_nik: signerNik,
          signer_name: user.nama,
          digsig_mode: digsigMode,
        },
        signingIdempotencyKey,
      );

      // 6. Persist request_id + state SEBELUM redirect (wajib §2.4)
      await this.transactionRepository.update(transaction.id, {
        requestId: request.request_id,
        state,
        signingUrl: request.signing_url,
        status: request.status,
        expiresAt: new Date(request.expires_at),
      });

      await this.logActivity(transaction, user, params, 'pending', {
        apiEndpoint: 'POST /signing-requests (portal)',
        note: `Signing request dibuat: ${request.request_id}`,
        portalResponse: {
          request_id: request.request_id,
          status: request.status,
        },
      });

      return {
        transactionId: transaction.id,
        requestId: request.request_id,
        signingUrl: request.signing_url,
        status: request.status,
        expiresAt: request.expires_at,
      };
    } catch (error) {
      // Tandai transaksi gagal pada tahap persiapan
      await this.transactionRepository.update(transaction.id, {
        status: 'FAILED',
        errorCode: 'PREPARATION_FAILED',
        errorMessage:
          error instanceof Error ? error.message : 'Persiapan signing gagal',
      });
      await this.logActivity(transaction, user, params, 'gagal', {
        apiEndpoint: 'POST /signing-requests (portal)',
        note:
          error instanceof Error
            ? error.message
            : 'Persiapan signing portal gagal',
      });
      throw error;
    }
  }

  /** Siapkan 2–20 PDF dan buat satu sesi Portal TTE untuk semuanya. */
  async createSigningBatch(
    params: CreateSigningBatchParams,
  ): Promise<CreateSigningTransactionResult> {
    if (params.documents.length < 2 || params.documents.length > 20) {
      throw new BadRequestException(
        'Batch Portal TTE harus berisi 2 sampai 20 dokumen',
      );
    }

    const user = params.user;
    const digsigMode = resolveTteDigsigMode();
    const signerNik = await this.signerIdentityService.getNik(
      user.persnum,
      user.sessionId,
      digsigMode,
    );
    const redirectUrl = process.env.TTE_REDIRECT_URL;
    if (!redirectUrl) {
      throw new BadRequestException(
        'TTE_REDIRECT_URL belum dikonfigurasi di server',
      );
    }
    const state = TtePortalClientService.generateState();
    const batchIdempotencyKey = TtePortalClientService.generateIdempotencyKey();
    const transactions: TteSigningTransactionEntity[] = [];

    try {
      for (const document of params.documents) {
        const pdfBuffer = await this.storageService.getFile(document.sourceKey);
        TtePortalClientService.assertPdf(pdfBuffer, 'Dokumen sumber TTE');
        const sha256 = TtePortalClientService.sha256Hex(pdfBuffer);
        const transaction = await this.transactionRepository.save(
          this.transactionRepository.create({
            id: uuidv4(),
            idNaskah: document.idNaskah || null,
            jenisNaskah: document.jenisNaskah || null,
            nomorNaskah: document.nomorNaskah || null,
            userPersnum: user.persnum,
            userName: user.nama || null,
            signerNik,
            signerName: user.nama || null,
            uploadId: null,
            presignIdempotencyKey:
              TtePortalClientService.generateIdempotencyKey(),
            signingIdempotencyKey: batchIdempotencyKey,
            sourceKey: document.sourceKey,
            sourceSha256: sha256,
            uploadStatus: 'PENDING',
            pathDokumen: document.pathDokumen,
            redirectUrl,
            tampilan: document.tampilan || 'INVISIBLE',
            digsigMode,
            state,
            status: 'PENDING',
          }),
        );
        transactions.push(transaction);

        const presign = await this.portalClient.presignUpload({
          filename: document.filename,
          size: pdfBuffer.length,
          sha256,
          idempotencyKey: transaction.presignIdempotencyKey!,
        });
        await this.transactionRepository.update(transaction.id, {
          uploadId: presign.upload_id,
          uploadStatus: presign.status,
        });
        transaction.uploadId = presign.upload_id;
        await this.portalClient.uploadPdfToStorage(presign, pdfBuffer);
        const complete = await this.portalClient.completeUpload(
          presign.upload_id,
        );
        if (complete.status !== 'VERIFIED') {
          throw new BadRequestException(
            `Upload portal tidak terverifikasi (status: ${complete.status})`,
          );
        }
        await this.transactionRepository.update(transaction.id, {
          uploadStatus: complete.status,
        });
      }

      const request = await this.portalClient.createSigningBatch(
        {
          documents: transactions.map((transaction, index) => ({
            upload_id: transaction.uploadId!,
            tampilan: params.documents[index].tampilan || 'INVISIBLE',
            ...(params.documents[index].tampilan === 'VISIBLE'
              ? {
                  tag: params.documents[index].tag,
                  jenis_ttd_visual: params.documents[index].jenisTtdVisual,
                  signature_width: params.documents[index].signatureWidth,
                  signature_height: params.documents[index].signatureHeight,
                }
              : {}),
            location: params.documents[index].location,
            reason: params.documents[index].reason,
          })),
          redirect_url: redirectUrl,
          state,
          location: params.documents[0].location,
          reason: params.documents[0].reason,
          signer_nik: signerNik,
          signer_name: user.nama,
          digsig_mode: digsigMode,
        },
        batchIdempotencyKey,
      );

      await this.transactionRepository.update(
        { id: In(transactions.map((transaction) => transaction.id)) },
        {
          requestId: request.request_id,
          signingUrl: request.signing_url,
          status: request.status,
          expiresAt: new Date(request.expires_at),
        },
      );

      return {
        transactionId: transactions[0].id,
        requestId: request.request_id,
        signingUrl: request.signing_url,
        status: request.status,
        expiresAt: request.expires_at,
      };
    } catch (error) {
      if (transactions.length) {
        await this.transactionRepository.update(
          { id: In(transactions.map((transaction) => transaction.id)) },
          {
            status: 'FAILED',
            errorCode: 'BATCH_PREPARATION_FAILED',
            errorMessage: (error instanceof Error
              ? error.message
              : 'Persiapan batch signing gagal'
            ).slice(0, 500),
          },
        );
      }
      throw error;
    }
  }

  /**
   * Langkah 5–6: tangani callback dari FE (query code & state).
   * Validasi state constant-time + one-time guard, lalu exchange.
   */
  async handleCallback(params: {
    code: string;
    state: string;
    user: JwtPayload;
  }): Promise<CallbackResult> {
    const { code, state, user } = params;

    // Cari transaksi aktif milik user dengan state tersebut
    const transaction = await this.findActiveByState(state, user.persnum);

    // Validasi state constant-time (§10 urutan validasi #2)
    const a = Buffer.from(String(transaction.state || ''));
    const b = Buffer.from(String(state));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException(
        'State callback tidak valid — transaksi tidak cocok',
      );
    }

    // One-time guard (§10 urutan validasi #3)
    if (transaction.callbackProcessed) {
      const recovered =
        await this.ensureSignedArtifactsAndCompletion(transaction);
      return this.toCallbackResult(recovered, 'Callback sudah pernah diproses');
    }

    // Claim callback secara atomik. callbackProcessed baru ditulis setelah
    // exchange sukses sehingga gangguan jaringan tidak membakar kesempatan
    // recovery.
    const claim = await this.transactionRepository
      .createQueryBuilder()
      .update(TteSigningTransactionEntity)
      .set({ callbackProcessing: true })
      .where('id = :id', { id: transaction.id })
      .andWhere('callback_processed = 0')
      .andWhere('callback_processing = 0')
      .execute();
    if (!claim.affected) {
      throw new ConflictException(
        'Callback transaksi sedang diproses. Silakan tunggu beberapa saat.',
      );
    }

    try {
      // Exchange code — berlaku 2 menit, single-use
      const exchange = await this.portalClient.exchangeAuthorizationCode({
        code,
        redirectUri: transaction.redirectUrl!,
        state,
      });

      const siblings = transaction.requestId
        ? await this.transactionRepository.find({
            where: {
              requestId: transaction.requestId,
              userPersnum: user.persnum,
            },
          })
        : [transaction];
      for (const sibling of siblings) {
        const document = exchange.documents?.find(
          (item) => item.upload_id === sibling.uploadId,
        );
        await this.transactionRepository.update(sibling.id, {
          exchangeDone: true,
          callbackProcessed: true,
          callbackProcessing: false,
          status: document?.status || exchange.status,
          signedAt: exchange.signed_at ? new Date(exchange.signed_at) : null,
          portalResponse: this.sanitizeExchangeResponse(exchange),
        });
        if (document && document.status !== 'SIGNED') {
          await this.completionDispatcher.failSigning(
            sibling,
            document.error_message || `Portal TTE: ${document.status}`,
          );
        }
      }

      let completedTransaction = await this.getTransactionOrThrow(
        transaction.id,
        user.persnum,
      );
      for (const sibling of siblings) {
        const exchangedTransaction = await this.getTransactionOrThrow(
          sibling.id,
          user.persnum,
        );
        const completed = await this.ensureSignedArtifactsAndCompletion(
          exchangedTransaction,
          exchange,
        );
        if (sibling.id === transaction.id) completedTransaction = completed;
      }

      await this.logActivity(transaction, user, null, 'sukses', {
        apiEndpoint: 'POST /signing/authorization-code/exchange (portal)',
        note: `Signing selesai: ${exchange.status}`,
        portalResponse: {
          request_id: exchange.request_id,
          status: exchange.status,
        },
      });

      return this.toCallbackResult(
        completedTransaction,
        'Signing berhasil diproses',
        exchange.status,
      );
    } catch (error) {
      // Bila response exchange putus setelah code dikonsumsi, status Portal
      // adalah source of truth. Coba rekonsiliasi sebelum menyatakan gagal.
      try {
        if (transaction.requestId) {
          const portalStatus = await this.portalClient.getSigningStatus(
            transaction.requestId,
          );
          await this.transactionRepository.update(transaction.id, {
            callbackProcessing: false,
            callbackProcessed: portalStatus.status === 'SIGNED',
            status: portalStatus.status,
            signedAt: portalStatus.signed_at
              ? new Date(portalStatus.signed_at)
              : transaction.signedAt,
            errorCode: portalStatus.error_code,
            errorMessage: portalStatus.error_message,
          });
          if (portalStatus.status === 'SIGNED') {
            const reconciled = await this.getTransactionOrThrow(
              transaction.id,
              user.persnum,
            );
            const completed =
              await this.ensureSignedArtifactsAndCompletion(reconciled);
            return this.toCallbackResult(
              completed,
              'Signing berhasil dipulihkan melalui rekonsiliasi status',
            );
          }
        }
      } catch (reconciliationError) {
        this.logger.warn(
          `Rekonsiliasi callback ${transaction.id} belum berhasil: ${
            reconciliationError instanceof Error
              ? reconciliationError.message
              : String(reconciliationError)
          }`,
        );
      }
      await this.transactionRepository.update(transaction.id, {
        callbackProcessing: false,
        status: 'RECONCILING',
        errorCode: 'CALLBACK_PROCESSING_FAILED',
        errorMessage:
          error instanceof Error ? error.message : 'Pemrosesan callback gagal',
      });
      await this.logActivity(transaction, user, null, 'gagal', {
        apiEndpoint: 'POST /signing/authorization-code/exchange (portal)',
        note: error instanceof Error ? error.message : 'Exchange code gagal',
      });
      throw error;
    }
  }

  private toCallbackResult(
    transaction: TteSigningTransactionEntity,
    message: string,
    statusOverride?: string,
  ): CallbackResult {
    return {
      transactionId: transaction.id,
      requestId: transaction.requestId || '',
      status: statusOverride || transaction.status,
      message,
    };
  }

  /**
   * Download PDF signed dari portal lalu upload ke MinIO Arsipku.
   * Pola adapter sama dengan mode bsre_direct: signed file di
   * {path_dokumen}/, name_doc = key aktual MinIO (uploadBuffer menambah
   * prefix {Date.now()}- — selalu pakai uploadResult.key).
   */
  private async downloadAndPersistSigned(
    transaction: TteSigningTransactionEntity,
    exchange: TteExchangeResponse,
  ): Promise<{ signedFilePath: string; signedSha256: string } | null> {
    const matchingDocument = exchange.documents?.find(
      (document) => document.upload_id === transaction.uploadId,
    );
    const downloadUrl = matchingDocument?.download_url || exchange.download_url;
    if (!downloadUrl) {
      this.logger.warn(
        `Tidak ada download_url pada exchange request ${exchange.request_id}`,
      );
      return null;
    }

    const signedBuffer = await this.portalClient.downloadSignedPdf(downloadUrl);
    const signedSha256 = TtePortalClientService.sha256Hex(signedBuffer);

    // Validasi SHA-256 hasil vs klaim portal bila tersedia
    const claimedSha = matchingDocument?.sha256;
    if (claimedSha && claimedSha.toLowerCase() !== signedSha256) {
      throw new BadRequestException(
        'SHA-256 PDF signed tidak cocok dengan klaim portal — file mungkin korup',
      );
    }

    const filename = transaction.sourceKey?.split('/').pop() || 'signed.pdf';
    const upload = await this.storageService.uploadBuffer(
      signedBuffer,
      filename.replace(/\.pdf$/i, '-tte.pdf'),
      'application/pdf',
      (transaction.pathDokumen || 'tte-portal/signed').replace(/\/$/, ''),
    );

    await this.transactionRepository.update(transaction.id, {
      signedFilePath: upload.key,
      signedSha256,
    });

    return { signedFilePath: upload.key, signedSha256 };
  }

  /**
   * Recovery tunggal untuk callback, polling, dan kelak webhook. Aman dipanggil
   * berulang: file hanya diunduh bila belum ada dan completion memakai claim DB.
   */
  private async ensureSignedArtifactsAndCompletion(
    transaction: TteSigningTransactionEntity,
    exchange?: TteExchangeResponse,
  ): Promise<TteSigningTransactionEntity> {
    if (transaction.status !== 'SIGNED') return transaction;

    let current = transaction;
    if (!current.signedFilePath) {
      let effectiveExchange = exchange;
      if (!effectiveExchange) {
        if (!current.requestId) return current;
        const download = await this.portalClient.getDownloadUrl(
          current.requestId,
        );
        effectiveExchange = {
          request_id: current.requestId,
          upload_id: current.uploadId || '',
          status: 'SIGNED',
          signed_at: current.signedAt?.toISOString() || null,
          documents: [],
          download_url: download.download_url,
          download_expires_at: download.expires_at,
        };
      }
      await this.downloadAndPersistSigned(current, effectiveExchange);
      current = await this.getTransactionOrThrow(
        current.id,
        current.userPersnum,
      );
    }

    if (!current.signedFilePath || current.completedAt) return current;

    const completionClaim = await this.transactionRepository
      .createQueryBuilder()
      .update(TteSigningTransactionEntity)
      .set({ completionProcessing: true, completionError: null })
      .where('id = :id', { id: current.id })
      .andWhere('completed_at IS NULL')
      .andWhere('completion_processing = 0')
      .execute();
    if (!completionClaim.affected) {
      return this.getTransactionOrThrow(current.id, current.userPersnum);
    }

    try {
      await this.completionDispatcher.completeSigning(
        current,
        current.signedFilePath,
      );
      await this.transactionRepository.update(current.id, {
        completionProcessing: false,
        completedAt: new Date(),
        completionError: null,
      });
      await this.correspondenceLifecycle?.reconcile(
        await this.getTransactionOrThrow(current.id, current.userPersnum),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Completion naskah gagal';
      await this.transactionRepository.update(current.id, {
        completionProcessing: false,
        completionError: message.slice(0, 500),
      });
      throw error;
    }

    return this.getTransactionOrThrow(current.id, current.userPersnum);
  }

  /**
   * Rekonsiliasi status transaksi via GET /signing-requests/{request_id}.
   * Dipakai FE untuk polling dan setelah webhook.
   */
  async getTransactionStatus(
    transactionId: string,
    userPersnum: number,
  ): Promise<TteTransactionStatusResult> {
    let transaction = await this.getTransactionOrThrow(
      transactionId,
      userPersnum,
    );

    // Hanya rekonsiliasi ke portal bila belum terminal
    const terminalStatuses = [
      'SIGNED',
      'PARTIAL',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
    ];
    if (
      transaction.requestId &&
      !terminalStatuses.includes(transaction.status)
    ) {
      try {
        const portalStatus = await this.portalClient.getSigningStatus(
          transaction.requestId,
        );
        if (portalStatus.status !== transaction.status) {
          await this.transactionRepository.update(transaction.id, {
            status: portalStatus.status,
            openedAt: portalStatus.opened_at
              ? new Date(portalStatus.opened_at)
              : transaction.openedAt,
            processingAt: portalStatus.processing_at
              ? new Date(portalStatus.processing_at)
              : transaction.processingAt,
            signedAt: portalStatus.signed_at
              ? new Date(portalStatus.signed_at)
              : transaction.signedAt,
            failedAt: portalStatus.failed_at
              ? new Date(portalStatus.failed_at)
              : transaction.failedAt,
            errorCode: portalStatus.error_code || transaction.errorCode,
            errorMessage:
              portalStatus.error_message || transaction.errorMessage,
          });
          transaction = await this.getTransactionOrThrow(
            transactionId,
            userPersnum,
          );
        }
      } catch (error) {
        // Rekonsiliasi gagal — return status lokal, jangan gagalkan polling
        this.logger.warn(
          `Rekonsiliasi portal gagal utk ${transaction.requestId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    if (transaction.status === 'SIGNED' && !transaction.completedAt) {
      try {
        transaction =
          await this.ensureSignedArtifactsAndCompletion(transaction);
      } catch (error) {
        this.logger.error(
          `Recovery hasil TTE gagal untuk ${transaction.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        transaction = await this.getTransactionOrThrow(
          transactionId,
          userPersnum,
        );
      }
    }

    await this.correspondenceLifecycle?.reconcile(transaction);
    return this.toStatusResult(transaction);
  }

  async getPendingCorrespondence(
    idNaskah: string,
    userPersnum: number,
    position?: string,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { idNaskah },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (!transaction)
      throw new NotFoundException(
        'Transaksi TTE pengguna untuk naskah ini tidak ditemukan',
      );
    const isSigner = transaction.userPersnum === userPersnum;
    if (
      !isSigner &&
      (!position ||
        !(await this.correspondenceLifecycle?.canReadPending(
          idNaskah,
          position,
        )))
    ) {
      throw new NotFoundException('Transaksi signing tidak ditemukan');
    }
    const status = await this.getTransactionStatus(
      transaction.id,
      transaction.userPersnum,
    );
    const resumable =
      isSigner &&
      ['PENDING', 'OPENED'].includes(status.status) &&
      (!status.expiresAt || new Date(status.expiresAt) > new Date());
    return { ...status, signingUrl: resumable ? transaction.signingUrl : null };
  }

  private async getTransactionOrThrow(
    transactionId: string,
    userPersnum: number,
  ): Promise<TteSigningTransactionEntity> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId, userPersnum },
    });
    if (!transaction) {
      throw new NotFoundException('Transaksi signing tidak ditemukan');
    }
    return transaction;
  }

  private toStatusResult(
    transaction: TteSigningTransactionEntity,
  ): TteTransactionStatusResult {
    return {
      id: transaction.id,
      idNaskah: transaction.idNaskah,
      jenisNaskah: transaction.jenisNaskah,
      nomorNaskah: transaction.nomorNaskah,
      requestId: transaction.requestId,
      status: transaction.status,
      openedAt: transaction.openedAt,
      processingAt: transaction.processingAt,
      signedAt: transaction.signedAt,
      expiresAt: transaction.expiresAt,
      completedAt: transaction.completedAt,
      errorCode: transaction.errorCode,
      errorMessage: transaction.errorMessage,
      completionError: transaction.completionError,
    };
  }

  /** Ambil transaksi aktif berdasarkan state + user (validasi callback) */
  private async findActiveByState(
    state: string,
    userPersnum: number,
  ): Promise<TteSigningTransactionEntity> {
    const transaction = await this.transactionRepository.findOne({
      where: { state, userPersnum },
      order: { createdAt: 'DESC' },
    });
    if (!transaction) {
      throw new NotFoundException(
        'Transaksi signing tidak ditemukan untuk state callback ini',
      );
    }
    return transaction;
  }

  /**
   * Resolve naskah berstatus pending_tte saat user mencoba finalize ulang.
   *
   * Return:
   * - { kind: 'redirect' }  → transaksi masih hidup (belum terminal & belum
   *   expired): FE harus redirect ke signingUrl transaksi yang sama, JANGAN
   *   buat request baru (request lama masih berlaku di portal).
   * - { kind: 'reset' }     → transaksi sudah terminal (SIGNED/PARTIAL gagal
   *   diselesaikan, FAILED, CANCELLED, EXPIRED, atau sudah expired tapi belum
   *   direkonsiliasi): tandai EXPIRED bila perlu dan izinkan caller me-reset
   *   naskah ke 'draf' agar bisa difinalisasi ulang.
   * - null                  → tidak ada transaksi untuk naskah ini (data lama):
   *   perlakukan seperti 'reset'.
   */
  async resolvePendingTteForRefinalize(
    idNaskah: string,
    userPersnum: number,
  ): Promise<
    | {
        kind: 'redirect';
        transactionId: string;
        signingUrl: string;
      }
    | { kind: 'reset'; transactionId: string | null }
    | null
  > {
    const transaction = await this.transactionRepository.findOne({
      where: { idNaskah, userPersnum },
      order: { createdAt: 'DESC' },
    });
    if (!transaction)
      throw new ConflictException(
        'Transaksi TTE belum teridentifikasi. Naskah tetap disimpan di Draf untuk pemeriksaan.',
      );

    await this.getTransactionStatus(transaction.id, userPersnum);
    const fresh = await this.transactionRepository.findOneOrFail({
      where: { id: transaction.id },
    });
    if (
      ['CANCELLED', 'EXPIRED', 'FAILED'].includes(fresh.status) &&
      !fresh.signedAt &&
      !fresh.signedFilePath &&
      !fresh.completedAt &&
      !fresh.completionProcessing &&
      !(
        fresh.errorCode === 'PREPARATION_FAILED' &&
        fresh.uploadStatus === 'VERIFIED'
      )
    ) {
      return { kind: 'reset', transactionId: fresh.id };
    }
    if (
      ['PENDING', 'OPENED'].includes(fresh.status) &&
      fresh.signingUrl &&
      (!fresh.expiresAt || new Date(fresh.expiresAt) > new Date())
    ) {
      return {
        kind: 'redirect',
        transactionId: fresh.id,
        signingUrl: fresh.signingUrl,
      };
    }
    throw new ConflictException(
      'Transaksi TTE belum dapat diulang. Periksa status naskah di Draf atau Terkirim.',
    );
  }

  /** Hapus presigned URL dari response sebelum disimpan ke DB (keamanan §16.3) */
  private sanitizeExchangeResponse(
    exchange: TteExchangeResponse,
  ): Record<string, any> {
    return {
      request_id: exchange.request_id,
      upload_id: exchange.upload_id,
      status: exchange.status,
      signed_at: exchange.signed_at,
      documents: exchange.documents?.map((doc) => ({
        item_id: doc.item_id,
        upload_id: doc.upload_id,
        name: doc.name,
        status: doc.status,
        sha256: doc.sha256,
        download_expires_at: doc.download_expires_at,
      })),
    };
  }

  private async logActivity(
    transaction: TteSigningTransactionEntity,
    user: JwtPayload,
    params: CreateSigningTransactionParams | null,
    status: 'sukses' | 'gagal' | 'pending',
    log: {
      apiEndpoint: string;
      note: string;
      portalResponse?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      await this.digsigLogService.logSignActivity({
        userPersnum: user.persnum,
        userName: user.nama,
        ipAddress: params?.ipAddress,
        idNaskah: transaction.idNaskah || params?.idNaskah,
        nomorNaskah: transaction.nomorNaskah || params?.nomorNaskah,
        jenisNaskah: transaction.jenisNaskah || params?.jenisNaskah,
        apiEndpoint: log.apiEndpoint,
        status,
        note: log.note,
        bsreResponse: log.portalResponse,
      });
    } catch (logError) {
      // Logging tidak boleh gagalkan alur utama
      this.logger.error(
        `Gagal log aktivitas TTE portal: ${
          logError instanceof Error ? logError.message : logError
        }`,
      );
    }
  }
}
