import { Entity, PrimaryColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('naskah_lainnya_approval')
@Index('idx_nl_approval_naskah', ['naskahId'])
export class NaskahLainnyaApprovalEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'naskah_id', length: 36 })
  naskahId: string;

  @Column('varchar', { length: 32 })
  tahap: string;

  @Column('varchar', { name: 'position_id', length: 64, nullable: true })
  positionId: string | null;

  @Column('varchar', { length: 255 })
  nama: string;

  @Column('varchar', { length: 255 })
  jabatan: string;

  @Column('int', { default: 1 })
  urutan: number;

  @Column('varchar', { length: 16, default: 'pending' })
  status: string;

  @Column('text', { nullable: true })
  catatan: string | null;

  @Column('datetime', { nullable: true })
  tanggal: Date | null;

  // ── Delegasi direksi per-naskah (PT/PH/PS). Nullable: baris tanpa delegasi / lama. ──
  @Column('int', { name: 'delegate_persnum', nullable: true })
  delegatePersnum: number | null;

  @Column('varchar', { name: 'delegate_name', length: 255, nullable: true })
  delegateName: string | null;

  @Column('varchar', { name: 'delegate_position_status', length: 8, nullable: true })
  delegatePositionStatus: string | null;

  @Column('int', { name: 'assigned_by_persnum', nullable: true })
  assignedByPersnum: number | null;

  @Column('datetime', { name: 'assigned_at', nullable: true })
  assignedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
