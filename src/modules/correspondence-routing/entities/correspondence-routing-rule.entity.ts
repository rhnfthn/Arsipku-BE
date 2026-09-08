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

@Entity('correspondence_routing_rule')
@Index('uq_cr_rule_company_code', ['company', 'code'], { unique: true })
@Index('idx_cr_rule_runtime', [
  'company',
  'document_type',
  'action_type',
  'is_active',
  'valid_from',
  'valid_to',
])
@Index('idx_cr_rule_source', ['source_role_id'])
@Index('idx_cr_rule_target', ['target_role_id'])
export class CorrespondenceRoutingRule extends RoutingAuditColumns {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;
  @Column({ type: 'int' })
  company: number;
  @Column({ type: 'varchar', length: 100 })
  code: string;
  @Column({ type: 'varchar', length: 200 })
  name: string;
  @Column({ type: 'text', nullable: true })
  description: string | null;
  @Column({ type: 'varchar', length: 10 })
  document_type: 'DI' | 'SDI';
  @Column({ type: 'varchar', length: 16 })
  action_type: 'CREATE' | 'FORWARD' | 'BOTH';
  @Column({ type: 'char', length: 36 })
  source_role_id: string;
  @Column({ type: 'char', length: 36 })
  target_role_id: string;
  @Column({ type: 'varchar', length: 16 })
  delivery_type: 'PENERIMA' | 'TEMBUSAN';
  @Column({ type: 'varchar', length: 20 })
  effect: 'ALLOW_SELECT' | 'AUTO_INCLUDE';
  @Column({ type: 'varchar', length: 24 })
  scope_type: 'ALL' | 'SAME_AREA' | 'SAME_SUB_AREA' | 'EXPLICIT';
  @Column({ type: 'varchar', length: 16 })
  behavior: 'ADD';
  @Column({ type: 'tinyint', width: 1, default: 0 })
  mandatory: number;
  @Column({ type: 'int', default: 100 })
  priority: number;
  @Column({ type: 'date' })
  valid_from: string;
  @Column({ type: 'date', nullable: true })
  valid_to: string | null;
  @Column({ type: 'tinyint', width: 1, default: 0 })
  is_active: number;
  @ManyToOne(() => CorrespondenceRoutingRole, {
    onUpdate: 'RESTRICT',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'source_role_id',
    foreignKeyConstraintName: 'fk_cr_rule_source',
  })
  source_role: CorrespondenceRoutingRole;
  @ManyToOne(() => CorrespondenceRoutingRole, {
    onUpdate: 'RESTRICT',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'target_role_id',
    foreignKeyConstraintName: 'fk_cr_rule_target',
  })
  target_role: CorrespondenceRoutingRole;
}
