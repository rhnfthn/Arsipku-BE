import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';

@Entity('klasifikasi')
export class KlasifikasiEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'varchar', length: 255 })
  klasifikasi: string;

  @Column({ type: 'text', nullable: true })
  klasifikasi_text: string;

  @Column({ type: 'text', nullable: true })
  deskripsi: string;

  @Column({ type: 'char', length: 36, nullable: true })
  id_parent: string;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  active: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  is_select: number;

  @Column({ type: 'int', nullable: true, default: 0 })
  retensi_aktif_tahun: number;

  @Column({ type: 'int', nullable: true, default: 0 })
  retensi_inaktif_tahun: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  penyusutan: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  keamanan: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  hak_akses: string;

  // Relasi ke parent
  @ManyToOne(() => KlasifikasiEntity, (klasifikasi) => klasifikasi.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'id_parent' })
  parent: KlasifikasiEntity;

  // Relasi ke children
  @OneToMany(() => KlasifikasiEntity, (klasifikasi) => klasifikasi.parent)
  children: KlasifikasiEntity[];
}
