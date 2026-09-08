import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { RoutingAuditColumns } from './routing-audit-columns';

@Entity('correspondence_routing_role')
@Index('uq_cr_role_company_code', ['company', 'code'], { unique: true })
@Index('idx_cr_role_company_active', ['company', 'is_active', 'deleted_at'])
export class CorrespondenceRoutingRole extends RoutingAuditColumns {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;
  @Column({ type: 'int' })
  company: number;
  @Column({ type: 'varchar', length: 64 })
  code: string;
  @Column({ type: 'varchar', length: 150 })
  name: string;
  @Column({ type: 'text', nullable: true })
  description: string | null;
  @Column({ type: 'tinyint', width: 1, default: 1 })
  is_active: number;
}
