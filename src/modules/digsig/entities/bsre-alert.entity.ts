import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entity untuk menyimpan status alert gangguan BSrE
 * Hanya ada 1 row aktif (singleton pattern)
 * Admin bisa toggle alert on/off, dan semua user melihat status ini
 */
@Entity('bsre_alert')
export class BsreAlertEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  /** Apakah alert aktif (ditampilkan ke semua user) */
  @Column('tinyint', { name: 'is_active', default: 0 })
  isActive: boolean;

  /** Pesan alert yang ditampilkan ke user */
  @Column('text', { name: 'message', nullable: true })
  message: string | null;

  /** Persnum admin yang mengaktifkan/menonaktifkan alert */
  @Column('int', { name: 'activated_by', nullable: true })
  activatedBy: number | null;

  /** Nama admin yang mengaktifkan/menonaktifkan alert */
  @Column('varchar', { name: 'activated_by_name', length: 150, nullable: true })
  activatedByName: string | null;

  /** Kapan alert terakhir diaktifkan */
  @Column('datetime', { name: 'activated_at', nullable: true })
  activatedAt: Date | null;

  /** Kapan alert terakhir dinonaktifkan */
  @Column('datetime', { name: 'deactivated_at', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
