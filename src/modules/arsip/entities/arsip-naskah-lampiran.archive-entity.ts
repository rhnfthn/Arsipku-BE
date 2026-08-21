import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Entity snapshot lampiran naskah di database arsipku_arsip_local.
 */
@Entity('arsip_naskah_lampiran')
export class ArsipNaskahLampiranEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'smallint', unsigned: true })
  archived_year: number;

  @Column({ type: 'char', length: 36, nullable: false })
  source_lampiran_id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  source_naskah_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  nama_file: string;

  @Column({ type: 'varchar', length: 500, nullable: false })
  path_file: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tipe_file: string | null;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  ukuran_bytes: number | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
