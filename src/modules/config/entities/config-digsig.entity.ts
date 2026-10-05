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
  /** Naskah Lainnya (workflow: LPD, BV, dll) — juga meng-cover Naskah Umum
   * (template UND, PER, KEP, dll) untuk konfigurasi TTE */
  NL = 'NL',
  /** Berita Acara (BAC) — pemindahan arsip aktif ke inaktif.
   * TTE untuk pejabat pihak pertama BAC (EVP) di halaman pemindahan. */
  BAC = 'BAC',
}

export enum TtdMode {
  DIGSIG = 'digsig',
  TTD_QR = 'ttd_qr',
  TTD_BASAH = 'ttd_basah',
}

/**
 * Jalur eksekusi TTE untuk mode digsig:
 * - bsre_direct: BSrE API v2 langsung (existing) — passphrase diinput user
 *   di aplikasi Arsipku (modal), dikirim server-to-server ke BSrE.
 * - portal: Portal TTE (client integration) — user di-redirect ke halaman
 *   portal dan memasukkan passphrase di sana (dokumentasi integrasi §1).
 */
export enum TteMode {
  BSRE_DIRECT = 'bsre_direct',
  PORTAL = 'portal',
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

  @Column('varchar', {
    length: 255,
    nullable: true,
    comment: 'Deskripsi pengaturan',
  })
  description: string;

  @Column({
    name: 'tte_mode',
    type: 'varchar',
    length: 20,
    default: TteMode.BSRE_DIRECT,
    comment:
      'Jalur TTE digsig: bsre_direct (BSrE v2 API langsung) | portal (redirect Portal TTE)',
  })
  tteMode: TteMode;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
