import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('template')
export class TemplateEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', name: 'nama_template', length: 150 })
  nama_template: string;

  @Column({ type: 'varchar', name: 'file', length: 100, nullable: true })
  file: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'create_at' })
  create_at: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'update_at' })
  update_at: Date;
}
