import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'titelatur_en' })
export class TitelaturEnEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  company: string;

  @Column({ type: 'date', nullable: true })
  start_date: Date;

  @Column({ type: 'date', nullable: true, default: '9999-12-31' })
  end_date: Date;

  @Column({ type: 'enum', enum: ['CO', 'PA', 'SA', 'S'], nullable: true })
  object_type: 'CO' | 'PA' | 'SA' | 'S' | null;

  @Column({ type: 'text', nullable: true })
  long_text: string | null;

  @Column({ type: 'text', nullable: true })
  long_text_en: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'create_at' })
  create_at: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'update_at' })
  update_at: Date;
}
