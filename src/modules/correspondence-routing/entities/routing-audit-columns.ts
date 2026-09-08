import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class RoutingAuditColumns {
  @Column({ type: 'int', nullable: true })
  created_by: number | null;

  @Column({ type: 'int', nullable: true })
  updated_by: number | null;

  @CreateDateColumn({
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', precision: 0, nullable: true })
  deleted_at: Date | null;
}
