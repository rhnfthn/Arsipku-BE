// ============================================================
// ENTITY: Pedoman
// Tabel: pedoman
// Menyimpan data dokumen pedoman (Peraturan, Keputusan, SOP).
// ============================================================

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Enum jenis dokumen pedoman.
 * Sesuai URS: Peraturan Direksi, Keputusan Direksi, dan SOP tentang Kearsipan.
 */
export enum PedomanJenis {
  PERATURAN_DIREKSI = 'Peraturan Direksi',
  KEPUTUSAN_DIREKSI = 'Keputusan Direksi',
  SOP_KEARSIPAN = 'SOP Kearsipan',
}

// ============================================================
// Tabel: pedoman
// Kolom: id, judul, deskripsi, jenis, nomorDokumen,
//        tanggalBerlaku, fileUrl, lampirans (JSON),
//        isActive (soft delete), created_at, updated_at
// ============================================================
@Entity('pedoman')
export class PedomanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  judul: string;

  @Column({ type: 'text' })
  deskripsi: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  jenis: PedomanJenis;

  @Column({ type: 'varchar', length: 100 })
  nomorDokumen: string;

  @Column({ type: 'date' })
  tanggalBerlaku: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileUrl?: string;

  @Column({ type: 'json', nullable: true })
  lampirans?: { url: string; name: string }[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}