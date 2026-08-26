import { Entity, PrimaryColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('naskah_lainnya_blanko')
@Index('idx_nl_blanko_naskah', ['naskahId'])
export class NaskahLainnyaBlankoEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'naskah_id', length: 36 })
  naskahId: string;

  @Column('varchar', { name: 'nomor_verbal', length: 100, nullable: true })
  nomorVerbal: string | null;

  @Column('date', { nullable: true })
  tanggal: Date | null;

  @Column('text', { nullable: true })
  perihal: string | null;

  @Column('text', { name: 'dasar_naskah', nullable: true })
  dasarNaskah: string | null;

  @Column('text', { nullable: true })
  catatan: string | null;

  @Column('varchar', { name: 's3_key', length: 500, nullable: true })
  s3Key: string | null;

  @Column('varchar', { length: 32, default: 'draf' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
