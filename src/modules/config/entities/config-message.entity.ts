import {
  Column,
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum MessageType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
}

@Entity('config_message')
export class ConfigMessage {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @Column('varchar', { length: 255, comment: 'Judul pesan' })
  title: string;

  @Column('text', { comment: 'Isi pesan' })
  message: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.INFO,
    comment: 'Tipe pesan untuk styling',
  })
  type: MessageType;

  @Column({
    type: 'tinyint',
    name: 'show_banner',
    default: 0,
    comment: 'Tampilkan banner atau tidak',
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  showBanner: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
