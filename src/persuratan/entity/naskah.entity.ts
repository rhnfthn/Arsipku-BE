import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('naskah')
export class NaskahEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('enum', {
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA'],
    comment: 'Jenis dokumen: ND=Nota Dinas, SDI=Surat Dinas Internal, SDE=Surat Dinas Eksternal, DI=Disposisi Internal, KA=Korespondensi Aktif',
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';

  @Column('varchar', { length: 50, nullable: true })
  klasifikasi: string;

  @Column('varchar', { length: 100, nullable: true })
  klasifikasi_text: string;

  @Column('enum', {
    enum: ['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'],
    comment: 'Tingkat kerahasiaan dokumen',
  })
  sifat: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka';

  @Column('varchar', { length: 100, nullable: true })
  nomor: string;

  @Column('date')
  tanggal: Date;

  @Column('varchar', { length: 100, nullable: true })
  lampiran: string;

  @Column('text', { nullable: true })
  perihal: string;

  @Column('text', { nullable: true })
  konten: string;

  @Column('varchar', { length: 100, nullable: true })
  tempat: string;

  @Column('enum', {
    enum: ['draf', 'final', 'final_tte'],
    default: 'draf',
    comment: 'Status dokumen: draf=sedang dibuat, final=final tanpa tandatangan, final_tte=final dengan tandatangan elektronik',
  })
  status: 'draf' | 'final' | 'final_tte';

  @Column('varchar', { length: 255, nullable: true })
  final_pdf: string;

  @Column('boolean', { default: false })
  english: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
