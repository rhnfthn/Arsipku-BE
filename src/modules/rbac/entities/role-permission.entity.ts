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
import { PermissionEntity } from './permission.entity';

@Entity('rbac_role_permission')
@Index('idx_rbac_rp_role_perm', ['roleId', 'permissionId'], { unique: true })
export class RolePermissionEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ name: 'role_id', type: 'char', length: 36 })
  roleId: string;

  @Column({ name: 'permission_id', type: 'char', length: 36 })
  permissionId: string;

  @ManyToOne(() => RoleEntity, (r) => r.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @ManyToOne(() => PermissionEntity, (p) => p.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_id' })
  permission: PermissionEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;
}
