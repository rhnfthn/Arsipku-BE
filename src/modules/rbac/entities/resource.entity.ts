import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { PermissionEntity } from './permission.entity';

@Entity('rbac_resource')
@Index('idx_rbac_resource_name', ['name'], { unique: true })
export class ResourceEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @OneToMany(() => PermissionEntity, (p) => p.resource)
  permissions: PermissionEntity[];
}