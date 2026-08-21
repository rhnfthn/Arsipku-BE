import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entity snapshot detail naskah di database arsipku_arsip_local.
 */
@Entity('arsip_naskah')
export class ArsipNaskahEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'smallint', unsigned: true })
  archived_year: number;

  @Column({ type: 'char', length: 36, nullable: false })
  source_naskah_id: string;

  @Column({ type: 'varchar', length: 10, nullable: false })
  jenis: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  klasifikasi: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  klasifikasi_text: string | null;

  @Column({ type: 'varchar', length: 20, nullable: false })
  sifat: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nomor: string | null;

  @Column({ type: 'date', nullable: false })
  tanggal: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lampiran: string | null;

  @Column({ type: 'text', nullable: true })
  perihal: string | null;

  @Column({ type: 'longtext', nullable: true })
  konten: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tempat: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  final_pdf: string | null;

  @Column({ type: 'boolean', nullable: false, default: false })
  english: boolean;

  @Column({ type: 'text', nullable: true })
  tanda_tangan: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sign_option: string | null;

  @Column({ type: 'text', nullable: true })
  dikirim_oleh: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by_position: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  atas_nama: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  atas_nama_position_id: string | null;

  @Column({ type: 'date', nullable: false })
  tanggal_masuk_arsip: string;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
