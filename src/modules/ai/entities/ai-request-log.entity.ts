import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('ai_request_logs')
export class AiRequestLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 36 })
  request_id: string;

  @Column({ type: 'int' })
  persnum: number;

  @Column({ type: 'enum', enum: ['kajian', 'disposisi', 'ND', 'SDI', 'SDE'] })
  naskah_type: 'kajian' | 'disposisi' | 'ND' | 'SDI' | 'SDE';

  @Column({ type: 'int' })
  status_code: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'int', nullable: true })
  duration_ms: number | null;

  @Column({ type: 'text', nullable: true })
  request_body_redacted: string | null;

  @Column({ type: 'int', nullable: true })
  response_size: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error_message: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
