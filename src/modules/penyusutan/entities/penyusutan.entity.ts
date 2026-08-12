import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PenyusutanStatus } from '../enums/penyusutan-status.enum';

/**
 * Entity untuk pengajuan penyusutan arsip.
 * Dibuat oleh Unit Dokumen (TU), diverifikasi oleh Atasan Managerial TU berjenjang.
 */
@Entity('penyusutan')
@Index('idx_penyusutan_tu', ['tuPersnum'])
@Index('idx_penyusutan_status', ['status'])
export class PenyusutanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nomor_usulan', type: 'varchar', length: 50 })
  nomorUsulan: string;

  @Column({ name: 'tgl_usulan', type: 'date', nullable: true })
  tanggalUsulan: Date | null;

  // ─── Unit Dokumen (pengusul) ───────────────────────────────────────
  @Column({ name: 'tu_persnum', type: 'int' })
  tuPersnum: number;

  @Column({ name: 'tu_name', type: 'varchar', length: 255 })
  tuName: string;

  // ─── Arsip ────────────────────────────────────────────────────────
  @Column({ name: 'berkas_id', type: 'varchar', length: 36 })
  berkasId: string;

  @Column({ name: 'kode_berkas', type: 'varchar', length: 100, nullable: true })
  kodeBerkas: string | null;

  @Column({ name: 'nama_berkas', type: 'varchar', length: 255 })
  namaBerkas: string;

  @Column({ name: 'klasifikasi', type: 'varchar', length: 50, nullable: true })
  klasifikasi: string | null;

  @Column({
    name: 'klasifikasi_text',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  klasifikasiText: string | null;

  @Column({ name: 'tgl_retensi_habis', type: 'date', nullable: true })
  tanggalRetensiHabis: Date | null;

  // ─── Jenis & catatan ──────────────────────────────────────────────
  @Column({
    name: 'jenis_penyusutan',
    type: 'varchar',
    length: 20,
    default: 'permanen',
  })
  jenisPenyusutan: string;

  @Column({ name: 'catatan', type: 'text', nullable: true })
  catatan: string | null;

  // ─── Verifikasi berjenjang ────────────────────────────────────────
  /** Urutan atasan yang sedang giliran verifikasi (1-based). 0 = belum mulai. */
  @Column({ name: 'current_verifikator_urutan', type: 'int', default: 1 })
  currentVerifikatorUrutan: number;

  /** Total level verifikasi (jumlah atasan). */
  @Column({ name: 'total_verifikator', type: 'int', default: 1 })
  totalVerifikator: number;

  // ─── Penataan / Pemusnahan ─────────────────────────────────────────
  @Column({
    name: 'lokasi_simpan',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  lokasiSimpan: string | null;

  @Column({
    name: 'berita_acara',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  beritaAcara: string | null;

  @Column({
    name: 'foto_dokumentasi',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  fotoDokumentasi: string | null;

  /** Daftar arsip (naskah) yang disusutkan. Array of {id, nama, kode}. */
  @Column({ name: 'daftar_arsip', type: 'json', nullable: true })
  daftarArsip: Array<{ id: string; nama: string; kode: string }> | null;

  // ─── Status ───────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: PenyusutanStatus,
    default: PenyusutanStatus.DRAFT,
  })
  status: PenyusutanStatus;

  @Column({ name: 'rejected_note', type: 'text', nullable: true })
  rejectedNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
