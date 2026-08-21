import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Entity log penyusutan di database arsipku_arsip_local.
 */
@Entity('arsip_penyusutan_log')
export class ArsipPenyusutanLogEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'smallint', unsigned: true })
  archived_year: number;

  @Column({ type: 'char', length: 36, nullable: true })
  source_penyusutan_id: string | null;

  @Column({ type: 'char', length: 36, nullable: false })
  source_berkas_id: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  jenis_penyusutan: string;

  @Column({ type: 'varchar', length: 40, nullable: false })
  status_sebelumnya: string;

  @Column({ type: 'varchar', length: 40, nullable: false })
  status_baru: string;

  @Column({ type: 'int', nullable: false })
  diproses_oleh_persnum: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  diproses_oleh_name: string | null;

  @Column({ type: 'text', nullable: true })
  catatan: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  berita_acara_url: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  foto_dokumentasi: string | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
