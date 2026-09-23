import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity('config_theme_template')
export class ConfigThemeTemplate {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @Column({ type: 'varchar', length: 20 })
  target: 'landing' | 'dashboard';

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey: string;

  @Column({
    name: 'is_system',
    type: 'tinyint',
    default: 0,
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  isSystem: boolean;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
