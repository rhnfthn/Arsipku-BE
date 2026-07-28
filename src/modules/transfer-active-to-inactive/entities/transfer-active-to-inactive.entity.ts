import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransferActiveToInactiveStatus } from '../enums/transfer-status.enum';

/**
 * Entity untuk pemindahan arsip aktif ke inaktif.
 * Flow 2 unit: Unit Kerja (Sekretaris + Atasan Managerial)
 *   → Unit Tata Naskah (TU + Atasan Managerial TU).
 */
@Entity('transfer_active_to_inactive')
export class TransferActiveToInactiveEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nomor_usulan', type: 'varchar', length: 50, unique: true })
  nomorUsulan: string;

  @Column({ name: 'tgl_usulan', type: 'date' })
  tanggalUsulan: Date;

  // ─── Sekretaris (pengusul) ────────────────────────────────────────────
  @Column({ name: 'sekretaris_persnum', type: 'int' })
  sekretarisPersnum: number;

  @Column({ name: 'sekretaris_name', type: 'varchar', length: 255 })
  sekretarisName: string;

  @Column({ name: 'divisi_id', type: 'int', nullable: true })
  divisiId: number | null;

  @Column({ name: 'divisi_name', type: 'varchar', length: 255, nullable: true })
  divisiName: string | null;

  // ─── Atasan Managerial Unit Kerja ─────────────────────────────────────
  @Column({ name: 'atasan_persnum', type: 'int' })
  atasanPersnum: number;

  @Column({ name: 'atasan_name', type: 'varchar', length: 255 })
  atasanName: string;

  @Column({ name: 'atasan_position_id', type: 'int', nullable: true })
  atasanPositionId: number | null;

  // ─── TU (Unit Tata Naskah) ────────────────────────────────────────────
  @Column({ name: 'tu_persnum', type: 'int', nullable: true })
  tuPersnum: number | null;

  @Column({ name: 'tu_name', type: 'varchar', length: 255, nullable: true })
  tuName: string | null;

  // ─── Atasan Managerial TU (EVP Corporate Secretary) ───────────────────
  @Column({ name: 'atasan_tu_persnum', type: 'int', nullable: true })
  atasanTuPersnum: number | null;

  @Column({
    name: 'atasan_tu_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  atasanTuName: string | null;

  // ─── Arsip ────────────────────────────────────────────────────────────
  @Column({ name: 'arsip_id', type: 'varchar', length: 36 })
  arsipId: string;

  @Column({ name: 'arsip_perihal', type: 'varchar', length: 255 })
  arsipPerihal: string;

  @Column({ name: 'arsip_kode', type: 'varchar', length: 100, nullable: true })
  arsipKode: string | null;

  @Column({ name: 'tgl_retensi_aktif_habis', type: 'date', nullable: true })
  tanggalRetensiAktifHabis: Date | null;

  // ─── Keterangan & status ──────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  keterangan: string | null;

  @Column({
    type: 'enum',
    enum: TransferActiveToInactiveStatus,
    default: TransferActiveToInactiveStatus.DRAFT,
  })
  status: TransferActiveToInactiveStatus;

  @Column({ name: 'rejected_note', type: 'text', nullable: true })
  rejectedNote: string | null;

  @Column({ name: 'verify_note', type: 'text', nullable: true })
  verifyNote: string | null;

  // ─── Approval Unit Kerja ─────────────────────────────────────────────
  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy: number | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'final_verified_by', type: 'int', nullable: true })
  finalVerifiedBy: number | null;

  @Column({ name: 'final_verified_at', type: 'datetime', nullable: true })
  finalVerifiedAt: Date | null;

  @Column({ name: 'final_verify_note', type: 'text', nullable: true })
  finalVerifyNote: string | null;

  // ─── Berita acara & pengiriman ───────────────────────────────────────
  @Column({
    name: 'berita_acara_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  beritaAcaraUrl: string | null;

  @Column({
    name: 'berita_acara_nomor',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  beritaAcaraNomor: string | null;

  @Column({ name: 'tgl_dikirim', type: 'datetime', nullable: true })
  tanggalDikirim: Date | null;

  // ─── Verifikasi berkas fisik (TU) ─────────────────────────────────────
  @Column({ name: 'physical_checklist', type: 'json', nullable: true })
  physicalChecklist: Record<string, boolean> | null;

  @Column({ name: 'physical_verified_by', type: 'int', nullable: true })
  physicalVerifiedBy: number | null;

  @Column({ name: 'physical_verified_at', type: 'datetime', nullable: true })
  physicalVerifiedAt: Date | null;

  @Column({ name: 'physical_verification_note', type: 'text', nullable: true })
  physicalVerificationNote: string | null;

  // ─── Persetujuan TU ───────────────────────────────────────────────────
  @Column({ name: 'tu_approved_by', type: 'int', nullable: true })
  tuApprovedBy: number | null;

  @Column({ name: 'tu_approved_at', type: 'datetime', nullable: true })
  tuApprovedAt: Date | null;

  @Column({ name: 'tu_final_approved_by', type: 'int', nullable: true })
  tuFinalApprovedBy: number | null;

  @Column({ name: 'tu_final_approved_at', type: 'datetime', nullable: true })
  tuFinalApprovedAt: Date | null;

  // ─── Penerimaan & penataan ────────────────────────────────────────────
  @Column({ name: 'received_at', type: 'datetime', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'arranged_at', type: 'datetime', nullable: true })
  arrangedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}