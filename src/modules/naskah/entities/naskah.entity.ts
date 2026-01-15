import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm';

@Entity('naskah')
export class NaskahEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('enum', {
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA', 'K'],
    comment:
      'Jenis dokumen: ND=Nota Dinas, SDI=Surat Dinas Internal, SDE=Surat Dinas Eksternal, DI=Disposisi Internal, KA=Korespondensi Aktif, K=Konsep (workflow tracking)',
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K';

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
  nomor: string | null;

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
    comment:
      'Status dokumen: draf=sedang dibuat, final=final tanpa tandatangan, final_tte=final dengan tandatangan elektronik',
  })
  status: 'draf' | 'final' | 'final_tte';

  @Column('varchar', { length: 255, nullable: true })
  final_pdf: string;

  @Column('boolean', { default: false })
  english: boolean;

  @Column('char', { length: 36, nullable: true, comment: 'ID naskah konsep (jenis K) jika ini adalah naskah ND/SDI/SDE dari konsep' })
  id_naskah_konsep: string | null;

  @Column('char', { length: 36, nullable: true, comment: 'ID naskah ND/SDI/SDE jika ini adalah konsep workflow (jenis K)' })
  id_naskah_asli: string | null;
}