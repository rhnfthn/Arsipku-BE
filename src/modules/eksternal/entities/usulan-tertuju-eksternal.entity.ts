import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UsulanTertujuStatus = 'pending' | 'disetujui' | 'ditolak';

/**
 * Usulan Tertuju Eksternal oleh user biasa.
 * Setelah disetujui TU (pusat/cabang sesuai area), data dipindahkan ke
 * tabel `eksternal` utama dan status usulan menjadi 'disetujui'.
 */
@Entity('usulan_tertuju_eksternal')
export class UsulanTertujuEksternalEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  /** Kode unik (5 huruf) — sama dengan eksternal, unik global lintas area. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  kode: string | null;

  @Column({ type: 'text', nullable: true })
  alamat: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telepon: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  /** Area/lokasi pengusul (auto dari org_data user) — TU verifikasi per area. */
  @Column({ type: 'varchar', length: 50 })
  area: string;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: UsulanTertujuStatus;

  /** Pengusul */
  @Column({ name: 'usulan_persnum', type: 'int' })
  usulanPersnum: number;

  @Column({ name: 'usulan_nama', type: 'varchar', length: 150 })
  usulanNama: string;

  @Column({ name: 'usulan_position', type: 'varchar', length: 50, nullable: true })
  usulanPosition: string | null;

  /** Verifikator (TU) — terisi saat approve/reject */
  @Column({ name: 'verified_persnum', type: 'int', nullable: true })
  verifiedPersnum: number | null;

  @Column({ name: 'verified_nama', type: 'varchar', length: 150, nullable: true })
  verifiedNama: string | null;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt: Date | null;

  /** Catatan TU saat menolak (opsional saat menyetujui) */
  @Column({ type: 'text', nullable: true })
  catatan: string | null;

  /** ID row di tabel eksternal hasil approve (untuk traceability) */
  @Column({ name: 'eksternal_id', type: 'char', length: 36, nullable: true })
  eksternalId: string | null;
}