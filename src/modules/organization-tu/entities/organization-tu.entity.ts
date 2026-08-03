import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Role dalam Unit TU (Tata Usaha).
 * - unit_dokumen: role TU (ditambahkan sebagai "tu" di JWT roles)
 * - sekretaris_delegasi: role Sekretaris (ditambahkan sebagai "sekretaris" di JWT roles)
 */
export enum OrganizationTuRole {
  UNIT_DOKUMEN = 'unit_dokumen',
  SEKRETARIS_DELEGASI = 'sekretaris_delegasi',
}

@Entity('organization_tu')
@Index('idx_orgtu_persnum', ['persnum'])
@Index('idx_orgtu_role', ['role'])
@Index('idx_orgtu_active', ['is_active'])
@Index('idx_orgtu_delegasi', ['delegasi_id'])
export class OrganizationTuEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  /** User yang diassign — persnum (int) sesuai pa_personal.persnum */
  @Column({ type: 'int' })
  persnum: number;

  @Column({ type: 'varchar', length: 30 })
  role: OrganizationTuRole;

  /** Area code (om_area.area) */
  @Column({ name: 'area_id', type: 'varchar', length: 50, nullable: true })
  area_id: string | null;

  /** Organization code (om_organization.organization) */
  @Column({
    name: 'organization_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  organization_id: string | null;

  /** Sub area code (om_area_sub.sub_area) */
  @Column({ name: 'sub_area_id', type: 'varchar', length: 50, nullable: true })
  sub_area_id: string | null;

  @Column({ name: 'valid_from', type: 'date' })
  valid_from: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  valid_to: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;

  /** persnum user yang membuat */
  @Column({ name: 'created_by', type: 'int', nullable: true })
  created_by: number | null;

  /** persnum user yang update */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updated_by: number | null;

  /** Link ke tabel delegasi jika record berasal dari integrasi delegasi */
  @Column({ name: 'delegasi_id', type: 'char', length: 36, nullable: true })
  delegasi_id: string | null;
}
