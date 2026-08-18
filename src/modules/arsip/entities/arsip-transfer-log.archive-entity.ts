import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Entity log transfer arsip di database arsipku_arsip_local.
 */
@Entity('arsip_transfer_log')
export class ArsipTransferLogEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'smallint', unsigned: true })
  archived_year: number;

  @Column({ type: 'char', length: 36, nullable: true })
  source_transfer_id: string | null;

  @Column({ type: 'char', length: 36, nullable: false })
  source_berkas_id: string;

  @Column({ type: 'varchar', length: 30, nullable: false })
  jenis_transfer: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nomor_usulan: string | null;

  @Column({ type: 'int', nullable: true })
  sekretaris_persnum: number | null;

  @Column({ type: 'int', nullable: true })
  atasan_persnum: number | null;

  @Column({ type: 'int', nullable: true })
  tu_persnum: number | null;

  @Column({ type: 'int', nullable: true })
  atasan_tu_persnum: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  status_akhir: string | null;

  @Column({ type: 'datetime', nullable: true })
  tanggal_dikirim: Date | null;

  @Column({ type: 'datetime', nullable: true })
  tanggal_diterima: Date | null;

  @Column({ type: 'datetime', nullable: true })
  tanggal_ditata: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lokasi_penataan: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  rak: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  baris: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  kolom: string | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
