import {
  Column,
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum JenisNaskah {
  ND = 'ND',
  SDI = 'SDI',
  SDE = 'SDE',
  DI = 'DI',
  KA = 'KA',
}

@Entity('config_digsig')
export class ConfigDigsig {
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
    enum: JenisNaskah,
    name: 'jenis_naskah',
    unique: true,
  })
  jenisNaskah: JenisNaskah;

  @Column('tinyint', { default: 1, comment: 'true = user dapat pilih TTE/tidak, false = auto skip TTE' })
  enabled: boolean;

  @Column('varchar', { length: 255, nullable: true, comment: 'Deskripsi pengaturan' })
  description: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
