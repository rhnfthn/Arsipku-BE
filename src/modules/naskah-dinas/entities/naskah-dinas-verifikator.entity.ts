import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';

export type NaskahDinasVerifikatorStatus =
  | 'pending'
  | 'waiting'
  | 'verified'
  | 'rejected';

@Entity('naskah_dinas_verifikator')
@Index('idx_nd_verifikator_naskah', ['idNaskah'])
@Index('idx_nd_verifikator_persnum', ['persnum'])
@Index('idx_nd_verifikator_status', ['status'])
export class NaskahDinasVerifikatorEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'id_naskah', type: 'char', length: 36 })
  idNaskah: string;

  @Column({ name: 'urutan', type: 'int' })
  urutan: number;

  @Column({ name: 'persnum', type: 'int' })
  persnum: number;

  @Column({ name: 'nama', type: 'varchar', length: 255, nullable: true })
  nama: string | null;

  @Column({ name: 'jabatan', type: 'varchar', length: 255, nullable: true })
  jabatan: string | null;

  @Column({ name: 'lokasi', type: 'varchar', length: 255, nullable: true })
  lokasi: string | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'company', type: 'varchar', length: 50, nullable: true })
  company: string | null;

  @Column({
    name: 'company_text',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyText: string | null;

  @Column({ name: 'area', type: 'varchar', length: 50, nullable: true })
  area: string | null;

  @Column({ name: 'area_text', type: 'varchar', length: 255, nullable: true })
  areaText: string | null;

  @Column({ name: 'sub_area', type: 'varchar', length: 50, nullable: true })
  subArea: string | null;

  @Column({
    name: 'sub_area_text',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  subAreaText: string | null;

  @Column({ name: 'organization', type: 'varchar', length: 50, nullable: true })
  organization: string | null;

  @Column({
    name: 'organization_text',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  organizationText: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'waiting', 'verified', 'rejected'],
    default: 'pending',
  })
  status: NaskahDinasVerifikatorStatus;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'rejected_at', type: 'datetime', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'keterangan', type: 'text', nullable: true })
  keterangan: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => NaskahEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'id_naskah' })
  naskah: NaskahEntity;
}
