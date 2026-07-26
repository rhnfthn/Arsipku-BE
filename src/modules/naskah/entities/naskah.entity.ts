import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('naskah')
export class NaskahEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('enum', {
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA', 'K', 'UND'],
    comment:
      'Jenis dokumen: ND=Nota Dinas, SDI=Surat Dinas Internal, SDE=Surat Dinas Eksternal, DI=Disposisi Internal, KA=Korespondensi Aktif, K=Konsep (workflow tracking), UND=Surat Undangan (Naskah Umum)',
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K' | 'UND';

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

  @Column('varchar', { length: 500, nullable: true })
  final_pdf: string;

  @Column('boolean', { default: false })
  english: boolean;

  @Column('char', {
    length: 36,
    nullable: true,
    comment:
      'ID naskah konsep (jenis K) jika ini adalah naskah ND/SDI/SDE dari konsep',
  })
  id_naskah_konsep: string | null;

  @Column('char', {
    length: 36,
    nullable: true,
    comment: 'ID naskah ND/SDI/SDE jika ini adalah konsep workflow (jenis K)',
  })
  id_naskah_asli: string | null;

  @Column('char', {
    length: 36,
    nullable: true,
    comment: 'ID naskah K parent (untuk forward/reject chain)',
  })
  id_naskah_parent: string | null;

  @Column('text', {
    name: 'tanda_tangan',
    nullable: true,
    comment: 'Tanda tangan elektronik (base64 image atau path)',
  })
  tandaTangan: string | null;

  @Column('enum', {
    name: 'sign_option',
    enum: ['digsig', 'qr_only', 'ttd_basah'],
    nullable: true,
    comment:
      'Opsi TTD saat kirim: digsig=BSrE, qr_only=QR Code, ttd_basah=TTD manual',
  })
  signOption: 'digsig' | 'qr_only' | 'ttd_basah' | null;

  @Column('text', {
    name: 'dikirim_oleh',
    nullable: true,
    comment:
      'JSON snapshot: {persnum, nama, position_text} orang yang mengirim/finalize naskah pending (bisa delegasi)',
    transformer: {
      to: (value: any) => (value ? JSON.stringify(value) : null),
      from: (value: string | null) => (value ? JSON.parse(value) : null),
    },
  })
  dikirimOleh: { persnum: string; nama: string; position_text: string } | null;

  @Column('varchar', {
    name: 'created_by_position',
    length: 100,
    nullable: true,
  })
  createdByPosition: string | null;

  // Garis Kewenangan (a.n.) — label pemberi kuasa di template signature.
  // Dipakai SDE. Null untuk naskah yang tidak pakai a.n.
  @Column('varchar', { name: 'atas_nama', length: 150, nullable: true })
  atasNama: string | null;

  // Position id pemberi kuasa (untuk auto-tembusan + restore form). Null untuk Dirut.
  @Column('varchar', {
    name: 'atas_nama_position_id',
    length: 50,
    nullable: true,
  })
  atasNamaPositionId: string | null;
}
