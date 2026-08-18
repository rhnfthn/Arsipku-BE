import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entity relasi naskah dalam berkas di database arsipku_arsip_local.
 */
@Entity('arsip_berkas_naskah')
export class ArsipBerkasNaskahEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'smallint', unsigned: true })
  archived_year: number;

  @Column({ type: 'bigint', unsigned: true, nullable: false })
  arsip_berkas_id: number;

  @Column({ type: 'char', length: 36, nullable: false })
  source_berkas_id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  source_naskah_id: string;

  @Column({ type: 'varchar', length: 10, nullable: false })
  jenis_naskah: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  sifat: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nomor_surat: string | null;

  @Column({ type: 'text', nullable: true })
  perihal: string | null;

  @Column({ type: 'longtext', nullable: true })
  konten: string | null;

  @Column({ type: 'date', nullable: true })
  tanggal_naskah: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sirkuler: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  id_sirkuler: string | null;

  @Column({ type: 'varchar', length: 20, nullable: false })
  sumber: string;

  @Column({ type: 'int', nullable: false, default: 0 })
  urutan: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  final_pdf: string | null;

  @Column({ type: 'varchar', length: 40, nullable: false, default: 'final' })
  status_naskah: string;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
