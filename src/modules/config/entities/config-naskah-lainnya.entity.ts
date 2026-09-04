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
 * Konfigurasi per jenis naskah lainnya (PER/KEP/INS/…):
 * - butuhLegal: default toggle Legal Drafting (Ya/Tidak) di form tulis.
 * - defaultKlasifikasi: kode klasifikasi bawaan saat jenis dipilih
 *   (disimpan sebagai KODE klasifikasi, bukan id — payload create naskah
 *   juga mengirim kode, lihat tulis.vue).
 */
@Entity('config_naskah_lainnya')
export class ConfigNaskahLainnya {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @Column({ type: 'varchar', length: 8, name: 'jenis_naskah', unique: true })
  jenisNaskah: string;

  @Column({
    name: 'butuh_legal',
    type: 'tinyint',
    default: 0,
    comment: 'Default Legal Drafting (Ya/Tidak) di form tulis',
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number) => Boolean(value),
    },
  })
  butuhLegal: boolean;

  @Column({
    name: 'default_klasifikasi',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Kode klasifikasi bawaan saat jenis dipilih',
  })
  defaultKlasifikasi: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
