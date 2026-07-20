import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('naskah')
export class NaskahEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('enum', {
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA', 'UND'],
    comment:
      'Jenis dokumen: ND=Nota Dinas, SDI=Surat Dinas Internal, SDE=Surat Dinas Eksternal, DI=Disposisi Internal, KA=Korespondensi Aktif, UND=Surat Undangan (Naskah Umum)',
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'UND';

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
    enum: ['draf', 'pending', 'final', 'final_tte'],
    default: 'draf',
    comment:
      'Status dokumen: draf=sedang dibuat, pending=menunggu TTD basah, final=final TTD basah, final_tte=final dengan TTD elektronik',
  })
  status: 'draf' | 'pending' | 'final' | 'final_tte';

  @Column('varchar', { length: 255, nullable: true })
  final_pdf: string;

  @Column('boolean', { default: false })
  english: boolean;

  @Column('text', { name: 'tanda_tangan', nullable: true, comment: 'Metadata TTE: signature_id, doc_id, verification_url, signed_at (JSON)' })
  tandaTangan: string | null;

  @Column('enum', {
    name: 'sign_option',
    enum: ['digsig', 'qr_only', 'ttd_basah'],
    nullable: true,
    comment: 'Opsi TTD saat kirim: digsig=BSrE, qr_only=QR Code, ttd_basah=TTD manual',
  })
  signOption: 'digsig' | 'qr_only' | 'ttd_basah' | null;

  @Column('text', {
    name: 'dikirim_oleh',
    nullable: true,
    comment: 'JSON snapshot: {persnum, nama, position_text} orang yang mengirim/finalize naskah pending (bisa delegasi)',
    transformer: {
      to: (value: any) => (value ? JSON.stringify(value) : null),
      from: (value: string | null) => (value ? JSON.parse(value) : null),
    },
  })
  dikirimOleh: { persnum: string; nama: string; position_text: string } | null;

  @Column('varchar', { name: 'created_by_position', length: 100, nullable: true })
  createdByPosition: string | null;

  // Garis Kewenangan (a.n.) — label pemberi kuasa di template signature.
  // Dipakai SDE (e.g. "Direktur Utama" atau "Direksi"). Null = tidak pakai a.n.
  @Column('varchar', { name: 'atas_nama', length: 150, nullable: true })
  atasNama: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
