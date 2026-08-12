import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity untuk daftar atasan managerial TU yang memverifikasi penyusutan berjenjang.
 * Setiap baris = 1 atasan pada urutan tertentu.
 */
@Entity('penyusutan_verifikator')
@Index('idx_pv_penyusutan', ['penyusutanId'])
@Index('idx_pv_atasan', ['atasanPersnum'])
export class PenyusutanVerifikatorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'penyusutan_id', type: 'char', length: 36 })
  penyusutanId: string;

  @Column({ name: 'atasan_persnum', type: 'int' })
  atasanPersnum: number;

  @Column({ name: 'atasan_name', type: 'varchar', length: 255 })
  atasanName: string;

  @Column({ name: 'atasan_position_id', type: 'int', nullable: true })
  atasanPositionId: number | null;

  @Column({
    name: 'atasan_position_text',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  atasanPositionText: string | null;

  /** Urutan verifikasi (1 = verifikasi pertama). */
  @Column({ name: 'urutan', type: 'int' })
  urutan: number;

  /** Status: MENUNGGU | DISETUJUI | DITOLAK. */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'MENUNGGU' })
  status: string;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'catatan', type: 'text', nullable: true })
  catatan: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
