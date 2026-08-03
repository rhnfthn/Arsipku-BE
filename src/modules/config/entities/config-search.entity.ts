import {
  Column,
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mode mesin pencarian global.
 * - v3: Search V3 (SQL-based, default)
 * - meili: Meilisearch (full-text, typo-tolerant)
 */
export enum SearchEngineMode {
  V3 = 'v3',
  MEILI = 'meili',
}

@Entity('config_search')
export class ConfigSearch {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @Column({
    type: 'enum',
    enum: SearchEngineMode,
    default: SearchEngineMode.V3,
    comment: 'Mesin pencarian aktif: v3 (SQL) atau meili (Meilisearch)',
  })
  mode: SearchEngineMode;

  @Column({
    type: 'tinyint',
    name: 'meili_enabled',
    default: 0,
    comment: 'Meilisearch aktif sebagai mesin pencarian',
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  meiliEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
