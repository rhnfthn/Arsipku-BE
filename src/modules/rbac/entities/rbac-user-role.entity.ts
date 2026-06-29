import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RoleEntity } from './role.entity';

@Entity('rbac_user_role')
@Index('idx_rbac_ur_user_role_unit', ['persnum', 'roleId', 'unitKerja'], { unique: true })
export class RbacUserRoleEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'int' })
  persnum: number;

  @Column({ name: 'role_id', type: 'char', length: 36 })
  roleId: string;

  @ManyToOne(() => RoleEntity, (r) => r.userRoles)
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @Column({ name: 'unit_kerja', type: 'varchar', length: 11, nullable: true })
  unitKerja: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;
}