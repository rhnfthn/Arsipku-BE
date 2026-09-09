import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { RoutingAuditColumns } from './routing-audit-columns';
import { CorrespondenceRoutingRole } from './correspondence-routing-role.entity';

@Entity('correspondence_routing_role_member')
@Index('uq_cr_member_period', ['role_id', 'position_id', 'valid_from'], {
  unique: true,
})
@Index('idx_cr_member_role_active_period', [
  'role_id',
  'is_active',
  'valid_from',
  'valid_to',
])
@Index('idx_cr_member_position_active', [
  'position_id',
  'is_active',
  'deleted_at',
])
export class CorrespondenceRoutingRoleMember extends RoutingAuditColumns {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;
  @Column({ type: 'char', length: 36 })
  role_id: string;
  @Column({ type: 'int' })
  position_id: number;
  @Column({ type: 'date' })
  valid_from: string;
  @Column({ type: 'date', nullable: true })
  valid_to: string | null;
  @Column({ type: 'tinyint', width: 1, default: 1 })
  is_active: number;
  @ManyToOne(() => CorrespondenceRoutingRole, {
    onUpdate: 'RESTRICT',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'role_id',
    foreignKeyConstraintName: 'fk_cr_member_role',
  })
  role: CorrespondenceRoutingRole;
}
