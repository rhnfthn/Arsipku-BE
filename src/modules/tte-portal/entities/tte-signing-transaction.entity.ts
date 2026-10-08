import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity transaksi signing via Portal TTE (client integration).
 *
 * Menyimpan state per langkah alur portal sesuai dokumentasi integrasi
 * (docs/TTE-Digsig/dokumentasi-integrasi-client-portal-tte.md):
 * presign → upload → complete → create signing request → (user redirect ke
 * portal, input passphrase di sana) → callback → exchange → download →
 * persist ke MinIO Arsipku.
 *
 * Persist tiap langkah SEBELUM melanjutkan (strategi ketahanan §3.3):
 * upload_id, request_id, state, status, timestamps.
 */
@Entity('tte_signing_transaction')
@Index('idx_tte_signing_user_status', ['userPersnum', 'status'])
@Index('idx_tte_signing_naskah', ['idNaskah'])
export class TteSigningTransactionEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // ── Konteks naskah Arsipku ─────────────────────────────────────────────
  /** ID naskah (tabel naskah) yang sedang ditandatangani */
  @Column('char', { name: 'id_naskah', length: 36, nullable: true })
  idNaskah: string | null;

  /** Jenis naskah: ND | SDI | SDE | KA | NL | disposisi | sde_masal | dll */
  @Column('varchar', { name: 'jenis_naskah', length: 50, nullable: true })
  jenisNaskah: string | null;

  /** Nomor naskah (untuk display/audit) */
  @Column('varchar', { name: 'nomor_naskah', length: 100, nullable: true })
  nomorNaskah: string | null;

  /** User yang memulai signing (dari JWT) */
  @Column('int', { name: 'user_persnum' })
  userPersnum: number;

  @Column('varchar', { name: 'user_name', length: 150, nullable: true })
  userName: string | null;

  /** NIK signer 16 digit: identitas uji pada DEV, NIK HR pengguna pada PRD */
  @Column('char', { name: 'signer_nik', length: 16 })
  signerNik: string;

  @Column('varchar', { name: 'signer_name', length: 150, nullable: true })
  signerName: string | null;

  // ── Langkah 1–3: upload pipeline ──────────────────────────────────────
  /** upload_id dari POST /uploads/presign (upl_<UUID>) */
  @Column('varchar', { name: 'upload_id', length: 64, nullable: true })
  uploadId: string | null;

  /** Idempotency key presign, dipertahankan untuk retry payload identik. */
  @Column('varchar', {
    name: 'presign_idempotency_key',
    length: 128,
    nullable: true,
  })
  presignIdempotencyKey: string | null;

  /** Key PDF asli di MinIO Arsipku (sumber yang di-upload ke portal) */
  @Column('varchar', { name: 'source_key', length: 500, nullable: true })
  sourceKey: string | null;

  /** SHA-256 PDF asli (hex lowercase) — dipakai saat presign & validasi hasil */
  @Column('char', { name: 'source_sha256', length: 64, nullable: true })
  sourceSha256: string | null;

  /** Status upload portal: PENDING | VERIFIED | REJECTED | EXPIRED */
  @Column('varchar', { name: 'upload_status', length: 20, nullable: true })
  uploadStatus: string | null;

  // ── Langkah 4: signing request ─────────────────────────────────────────
  /** request_id portal (sig_<UUID>) — primary reference untuk status/webhook/download */
  @Column('varchar', { name: 'request_id', length: 64, nullable: true })
  @Index('idx_tte_signing_request_id')
  requestId: string | null;

  /** Idempotency key create signing request. */
  @Column('varchar', {
    name: 'signing_idempotency_key',
    length: 128,
    nullable: true,
  })
  signingIdempotencyKey: string | null;

  /**
   * State anti-CSRF acak — dibuat BE, dikirim ke portal saat create request,
   * divalidasi constant-time saat callback. Disimpan SEBELUM redirect.
   */
  @Column('varchar', { name: 'state', length: 128, nullable: true })
  state: string | null;

  /** signing_url sementara untuk browser penanda tangan */
  @Column('varchar', { name: 'signing_url', length: 500, nullable: true })
  signingUrl: string | null;

  /** redirect_url yang terdaftar di allowlist (exact-match) */
  @Column('varchar', { name: 'redirect_url', length: 2048, nullable: true })
  redirectUrl: string | null;

  /** Mode tampilan signature: INVISIBLE | VISIBLE */
  @Column('varchar', { name: 'tampilan', length: 20, nullable: true })
  tampilan: 'INVISIBLE' | 'VISIBLE' | null;

  /** digsig_mode yang dipakai: DEV | PRD */
  @Column('varchar', { name: 'digsig_mode', length: 10, nullable: true })
  digsigMode: 'DEV' | 'PRD' | null;

  // ── Status lifecycle portal (§14) ──────────────────────────────────────
  /**
   * PENDING | OPENED | PROCESSING | RECONCILING | SIGNED | PARTIAL | FAILED
   * | CANCELLED | EXPIRED | CREATED (internal: request dibuat, belum dibuka)
   */
  @Column('varchar', { name: 'status', length: 20, default: 'PENDING' })
  status: string;

  /** Timestamps lifecycle portal */
  @Column('timestamp', { name: 'opened_at', nullable: true })
  openedAt: Date | null;

  @Column('timestamp', { name: 'processing_at', nullable: true })
  processingAt: Date | null;

  @Column('timestamp', { name: 'signed_at', nullable: true })
  signedAt: Date | null;

  @Column('timestamp', { name: 'cancelled_at', nullable: true })
  cancelledAt: Date | null;

  @Column('timestamp', { name: 'failed_at', nullable: true })
  failedAt: Date | null;

  @Column('timestamp', { name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  // ── Hasil signing ─────────────────────────────────────────────────────
  /**
   * Key PDF signed di MinIO Arsipku — diisi setelah download dari portal
   * dan upload ke MinIO (pola adapter sama dengan mode bsre_direct).
   */
  @Column('varchar', { name: 'signed_file_path', length: 500, nullable: true })
  signedFilePath: string | null;

  /** SHA-256 PDF signed dari portal (untuk validasi download) */
  @Column('char', { name: 'signed_sha256', length: 64, nullable: true })
  signedSha256: string | null;

  /** Folder tujuan MinIO Arsipku ({path_dokumen} mode lama) */
  @Column('varchar', { name: 'path_dokumen', length: 255, nullable: true })
  pathDokumen: string | null;

  /** Callback sudah diproses (one-time guard §10) */
  @Column('tinyint', { name: 'callback_processed', width: 1, default: 0 })
  callbackProcessed: boolean;

  /** Lock singkat agar dua callback tidak menukar code yang sama bersamaan. */
  @Column('tinyint', { name: 'callback_processing', width: 1, default: 0 })
  callbackProcessing: boolean;

  /** Code sudah ditukar via exchange */
  @Column('tinyint', { name: 'exchange_done', width: 1, default: 0 })
  exchangeDone: boolean;

  /** Guard completion bisnis (update final_pdf/workflow) agar idempotent. */
  @Column('tinyint', { name: 'completion_processing', width: 1, default: 0 })
  completionProcessing: boolean;

  @Column('timestamp', { name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @Column('varchar', { name: 'completion_error', length: 500, nullable: true })
  completionError: string | null;

  /** Response mentah exchange/download (audit; tanpa presigned URL di log) */
  @Column('json', { name: 'portal_response', nullable: true })
  portalResponse: Record<string, any> | null;

  /** Error code portal bila gagal (mis. SIGNING_FAILED, UPLOAD_EXPIRED) */
  @Column('varchar', { name: 'error_code', length: 100, nullable: true })
  errorCode: string | null;

  @Column('varchar', { name: 'error_message', length: 500, nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
