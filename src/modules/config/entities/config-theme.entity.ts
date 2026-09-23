import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity('config_special_theme')
@Index('UQ_config_special_theme_name', ['name'], { unique: true })
@Index('UQ_config_special_theme_slug', ['slug'], { unique: true })
@Index('UQ_config_special_theme_manual_override', ['manualOverride'], {
  unique: true,
})
export class ConfigTheme {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @Column('varchar', { length: 100 })
  name: string;

  @Column('varchar', { length: 100 })
  slug: string;

  @Column('varchar', { name: 'image_key', length: 255 })
  imageKey: string;

  @Column('varchar', { length: 500, nullable: true })
  description: string | null;

  @Column('date', { name: 'start_date', nullable: true })
  startDate: string | null;

  @Column('date', { name: 'end_date', nullable: true })
  endDate: string | null;

  @Column('tinyint', {
    name: 'repeat_yearly',
    default: 0,
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  repeatYearly: boolean;

  @Column('tinyint', {
    name: 'is_enabled',
    default: 1,
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  isEnabled: boolean;

  // NULL untuk tema biasa, TRUE hanya untuk satu tema manual aktif.
  // Unique index MySQL mengizinkan banyak NULL tetapi hanya satu TRUE.
  @Column('tinyint', {
    name: 'manual_override',
    nullable: true,
    transformer: {
      to: (value: boolean | null) => (value === null ? null : value ? 1 : 0),
      from: (value: number | null) => (value === null ? null : Boolean(value)),
    },
  })
  manualOverride: boolean | null;

  @Column('int', { default: 0 })
  priority: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
