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

@Entity('naskah_routing_applied')
@Index(
  'uq_nra_application',
  [
    'id_naskah',
    'naskah_tanggal',
    'source_position_id',
    'target_position_id',
    'delivery_type',
    'rule_id',
  ],
  { unique: true },
)
@Index('idx_nra_naskah', ['id_naskah', 'naskah_tanggal'])
@Index('idx_nra_rule', ['rule_id'])
export class NaskahRoutingApplied {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;
  @Column({ type: 'char', length: 36 })
  id_naskah: string;
  @Column({ type: 'date' })
  naskah_tanggal: string;
  @Column({ type: 'char', length: 36, nullable: true })
  rule_id: string | null;
  @Column({ type: 'int' })
  source_position_id: number;
  @Column({ type: 'int' })
  target_position_id: number;
  @Column({ type: 'varchar', length: 16 })
  delivery_type: 'PENERIMA' | 'TEMBUSAN';
  @Column({ type: 'varchar', length: 20 })
  effect: 'ALLOW_SELECT' | 'AUTO_INCLUDE';
  @Column({ type: 'tinyint', width: 1 })
  mandatory: number;
  @Column({
    type: 'longtext',
    transformer: {
      to: (value: Record<string, unknown>) => JSON.stringify(value),
      from: (value: string) => JSON.parse(value) as Record<string, unknown>,
    },
  })
  rule_snapshot: Record<string, unknown>;
  @CreateDateColumn({
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  applied_at: Date;
  @ManyToOne(() => CorrespondenceRoutingRule, {
    nullable: true,
    onUpdate: 'RESTRICT',
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'rule_id', foreignKeyConstraintName: 'fk_nra_rule' })
  rule: CorrespondenceRoutingRule | null;
}
