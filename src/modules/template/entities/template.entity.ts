import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('template')
export class TemplateEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', name: 'id_position', length: 50 })
  id_position: string;

  @Column({ type: 'varchar', name: 'nama_template', length: 150 })
  nama_template: string;

  @Column({ type: 'text', name: 'content', nullable: true })
  content: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'create_at' })
  create_at: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'update_at' })
  update_at: Date;
}
