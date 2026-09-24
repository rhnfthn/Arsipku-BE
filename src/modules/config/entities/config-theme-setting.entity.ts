import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('config_special_theme_setting')
export class ConfigThemeSetting {
  @PrimaryColumn('varchar', { length: 32 })
  id: string;

  @Column('tinyint', {
    name: 'force_default',
    default: 0,
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  forceDefault: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
