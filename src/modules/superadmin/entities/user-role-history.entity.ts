import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum RoleAction {
  ASSIGNED = 'assigned',
  REMOVED = 'removed',
}

@Entity('user_role_history')
@Index('idx_persnum_history', ['persnum'])
@Index('idx_assigned_by', ['assignedBy'])
@Index('idx_action', ['action'])
@Index('idx_created_at', ['createdAt'])
export class UserRoleHistoryEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'int', nullable: false })
  persnum: number;

  @Column({ type: 'varchar', length: 20, nullable: false })
  role: string;

  @Column({
    type: 'enum',
    enum: RoleAction,
    nullable: false,
  })
  action: RoleAction;

  @Column({ type: 'int', nullable: false, name: 'assigned_by' })
  assignedBy: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
