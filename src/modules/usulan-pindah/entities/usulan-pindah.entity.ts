import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UsulanPindahStatus } from '../enums/usulan-status.enum';

/**
 * Entity untuk usulan pindah arsip inaktif.
 *
 * Schema `navmail` (sama dengan berkas & usulan_akses_berkas).
 * Flow status lihat `UsulanPindahStatus`.
 */
@Entity('usulan_pindah_arsip_inaktif', { schema: 'navmail' })
export class UsulanPindahArsipInaktifEntity {
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

  // ─── Atasan Managerial (verifikator/approver) ─────────────────────────
  @Column({ name: 'atasan_persnum', type: 'int' })
  atasanPersnum: number;

  @Column({ name: 'atasan_name', type: 'varchar', length: 255 })
  atasanName: string;

  @Column({ name: 'atasan_position_id', type: 'int', nullable: true })
  atasanPositionId: number | null;

  // ─── Arsip yang diusulkan untuk dipindah ──────────────────────────────
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
    enum: UsulanPindahStatus,
    default: UsulanPindahStatus.DRAFT,
  })
  status: UsulanPindahStatus;

  @Column({ name: 'rejected_note', type: 'text', nullable: true })
  rejectedNote: string | null;

  @Column({ name: 'verify_note', type: 'text', nullable: true })
  verifyNote: string | null;

  // ─── Approval (atasan) ────────────────────────────────────────────────
  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy: number | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  // ─── Verifikasi terakhir (EVP Corporate Secretary / atasan managerial) ─
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

  // ─── Berkas fisik ────────────────────────────────────────────────────
  @Column({ name: 'physical_checklist', type: 'json', nullable: true })
  physicalChecklist: Record<string, boolean> | null;

  @Column({ name: 'physical_prepared_by', type: 'int', nullable: true })
  physicalPreparedBy: number | null;

  @Column({ name: 'physical_prepared_at', type: 'datetime', nullable: true })
  physicalPreparedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
