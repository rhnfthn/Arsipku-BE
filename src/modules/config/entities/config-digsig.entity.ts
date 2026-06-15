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

export enum TtdMode {
  DIGSIG = 'digsig',
  TTD_QR = 'ttd_qr',
  TTD_BASAH = 'ttd_basah',
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

  @Column({
    type: 'tinyint',
    default: 1,
    comment: 'TTE elektronik (digsig) aktif',
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  digsig: boolean;

  @Column({
    name: 'ttd_qr',
    type: 'tinyint',
    default: 0,
    comment: 'QR code aktif',
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  ttdQr: boolean;

  @Column({
    name: 'ttd_basah',
    type: 'tinyint',
    default: 0,
    comment: 'Tanda tangan basah aktif',
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  ttdBasah: boolean;

  @Column('varchar', { length: 255, nullable: true, comment: 'Deskripsi pengaturan' })
  description: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
