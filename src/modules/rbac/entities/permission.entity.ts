import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { ResourceEntity } from './resource.entity';
import { RolePermissionEntity } from './role-permission.entity';

@Entity('rbac_permission')
@Index('idx_rbac_perm_resource_action', ['resourceId', 'action'], {
  unique: true,
})
@Index('idx_rbac_perm_name', ['name'], { unique: true })
export class PermissionEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'resource_id', type: 'char', length: 36 })
  resourceId: string;

  @ManyToOne(() => ResourceEntity, (r) => r.permissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resource_id' })
  resource: ResourceEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @OneToMany(() => RolePermissionEntity, (rp) => rp.permission)
  rolePermissions: RolePermissionEntity[];
}
