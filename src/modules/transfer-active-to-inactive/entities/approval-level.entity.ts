import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity untuk daftar atasan yang memverifikasi usulan secara berjenjang.
 * Setiap baris = 1 atasan pada urutan tertentu.
 */
@Entity('transfer_approval_levels')
@Index('idx_tal_transfer', ['transferId'])
@Index('idx_tal_atasan', ['atasanPersnum'])
export class TransferApprovalLevelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Kunci partisi (per tahun). */
  @PrimaryColumn('date')
  tanggal: Date;

  @Column({ name: 'transfer_id', type: 'char', length: 36 })
  transferId: string;

  @Column({ name: 'atasan_persnum', type: 'int' })
  atasanPersnum: number;

  @Column({ name: 'atasan_name', type: 'varchar', length: 255 })
  atasanName: string;

  @Column({ name: 'atasan_position_id', type: 'int', nullable: true })
  atasanPositionId: number | null;

  @Column({ name: 'atasan_position_text', type: 'varchar', length: 255, nullable: true })
  atasanPositionText: string | null;

  /** Urutan verifikasi (1 = verifikasi pertama). */
  @Column({ name: 'urutan', type: 'int' })
  urutan: number;

  /** Status level: MENUNGGU | DISETUJUI | DITOLAK. */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'MENUNGGU',
  })
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