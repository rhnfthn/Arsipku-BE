import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity untuk tabel `sde_masal` (versi ramping sesuai perombakan SDE Masal).
 *
 * SDE Masal = SDE biasa × N. Setiap baris = 1 surat SDE lengkap yang
 * dibuat saat finalize. Field surat (perihal, konten, nomor, tanggal,
 * klasifikasi, sifat, pengirim, dll) disimpan di tabel `naskah`.
 * Field penerima/tembusan disimpan di `naskah_sirkulasi`.
 * Metadata yang sama untuk semua surat disimpan di `sde_masal_folder`.
 * Variabel dinamis dari Excel disimpan di `recipient_data` (JSON) dan
 * di-render ke `naskah.konten` saat finalize.
 *
 * Sisa field inti:
 *  id, folder_id, recipient_data, naskah_id,
 *  status_verifikasi, verifikators, current_verifikator_urutan,
 *  submitted_at, error_message, created_at, updated_at.
 */
@Entity('sde_masal')
export class SdeMasalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_sde_masal_folder')
  @Column({ name: 'folder_id', type: 'char', length: 36, nullable: true })
  folderId: string | null;

  @Column({ name: 'recipient_data', type: 'text', nullable: true })
  recipientData: string | null;

  @Index('idx_sde_masal_status')
  @Column({
    name: 'status_verifikasi',
    type: 'varchar',
    length: 20,
    default: 'MENUNGGU',
  })
  statusVerifikasi: string;

  @Column({ name: 'naskah_id', type: 'char', length: 36, nullable: true })
  naskahId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'verifikators', type: 'json', nullable: true })
  verifikators: any[] | null;

  @Column({ name: 'current_verifikator_urutan', type: 'int', nullable: true })
  currentVerifikatorUrutan: number | null;

  @Column({ name: 'submitted_at', type: 'datetime', nullable: true })
  submittedAt: Date | null;

  // Position ID pembuat item (scope per-akun)
  @Index('idx_sde_masal_created_by')
  @Column({ name: 'created_by', type: 'varchar', length: 50, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
