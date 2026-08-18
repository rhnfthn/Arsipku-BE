import { Entity, PrimaryColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('naskah_lainnya_riwayat')
@Index('idx_nl_riwayat_naskah', ['naskahId'])
export class NaskahLainnyaRiwayatEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'naskah_id', length: 36 })
  naskahId: string;

  @Column('varchar', { length: 64 })
  aksi: string;

  @Column('varchar', { length: 255 })
  aktor: string;

  @Column('varchar', { length: 255, nullable: true })
  jabatan: string | null;

  @Column('varchar', { length: 64, nullable: true })
  tahap: string | null;

  @Column('varchar', { length: 64, nullable: true })
  status: string | null;

  @Column('text', { nullable: true })
  catatan: string | null;

  @Column('datetime')
  tanggal: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
