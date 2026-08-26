import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('legal_role')
export class LegalRoleEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'position_id', type: 'varchar', length: 50, unique: true })
  positionId: string;

  @Column({ name: 'persnum', type: 'int', nullable: true })
  persnum: number | null;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  jabatan: string | null;

  @Column({ name: 'unit_id', type: 'int', default: 10002099 })
  unitId: number;

  @Column({ name: 'unit_name', type: 'varchar', length: 200, nullable: true })
  unitName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}