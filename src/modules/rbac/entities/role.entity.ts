import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { RolePermissionEntity } from './role-permission.entity';
import { RbacUserRoleEntity } from './rbac-user-role.entity';
import { RoleName } from '../../../common/enums/role-name.enum';

export { RoleName };

@Entity('rbac_role')
@Index('idx_rbac_role_name', ['name'], { unique: true })
export class RoleEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  name: RoleName;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @OneToMany(() => RbacUserRoleEntity, (ur) => ur.role)
  userRoles: RbacUserRoleEntity[];

  @OneToMany(() => RolePermissionEntity, (rp) => rp.role)
  rolePermissions: RolePermissionEntity[];
}