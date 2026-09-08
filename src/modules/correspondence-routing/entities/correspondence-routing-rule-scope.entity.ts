import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CorrespondenceRoutingRule } from './correspondence-routing-rule.entity';

@Entity('correspondence_routing_rule_scope')
@Index(
  'uq_cr_scope',
  ['rule_id', 'side', 'entity_type', 'entity_id', 'include_flag'],
  { unique: true },
)
@Index('idx_cr_scope_rule', ['rule_id'])
export class CorrespondenceRoutingRuleScope {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;
  @Column({ type: 'char', length: 36 })
  rule_id: string;
  @Column({ type: 'varchar', length: 10 })
  side: 'SOURCE' | 'TARGET';
  @Column({ type: 'varchar', length: 20 })
  entity_type: 'AREA' | 'SUB_AREA' | 'ORGANIZATION' | 'POSITION';
  @Column({ type: 'varchar', length: 100 })
  entity_id: string;
  @Column({ type: 'tinyint', width: 1, default: 1 })
  include_flag: number;
  @CreateDateColumn({
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;
  @ManyToOne(() => CorrespondenceRoutingRule, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rule_id', foreignKeyConstraintName: 'fk_cr_scope_rule' })
  rule: CorrespondenceRoutingRule;
}
