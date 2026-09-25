import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('naskah')
@Index('idx_naskah_tanggal', ['tanggal'])
export class NaskahEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('enum', {
    enum: [
      'ND',
      'SDI',
      'SDE',
      'DI',
      'KA',
      'K',
      'UND',
      'PER',
      'KEP',
      'INS',
      'SPR',
      'EDR',
      'SOP',
      'MOU',
      'PKS',
      'PROC',
      'PJJ',
      'LOA',
      'SKU',
      'BAC',
      'KET',
      'SPE',
      'RPT',
      'PEN',
      'PGM',
      'LAP',
    ],
    comment:
      'Jenis dokumen: ND=Nota Dinas, SDI=Surat Dinas Internal, SDE=Surat Dinas Eksternal, DI=Disposisi Internal, KA=Korespondensi Aktif, K=Korespondensi Lama, UND=Surat Undangan, PER/KEP/INS/SPR/EDR/SOP/MOU/PKS/PROC/PJJ/LOA/SKU/BAC/KET/SPE/RPT/PEN/PGM/LAP=Naskah Lainnya',
  })
  jenis:
    | 'ND'
    | 'SDI'
    | 'SDE'
    | 'DI'
    | 'KA'
    | 'K'
    | 'UND'
    | 'PER'
    | 'KEP'
    | 'INS'
    | 'SPR'
    | 'EDR'
    | 'SOP'
    | 'MOU'
    | 'PKS'
    | 'PROC'
    | 'PJJ'
    | 'LOA'
    | 'SKU'
    | 'BAC'
    | 'KET'
    | 'SPE'
    | 'RPT'
    | 'PEN'
    | 'PGM'
    | 'LAP';

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

  @PrimaryColumn('date')
  tanggal: Date;

  @Column('varchar', { length: 255, nullable: true })
  lampiran: string;

  @Column('text', { nullable: true })
  perihal: string;

  @Column('text', { nullable: true })
  konten: string;

  @Column('varchar', { length: 100, nullable: true })
  tempat: string;

  @Column('enum', {
    enum: ['draf', 'pending', 'pending_tte', 'final', 'final_tte'],
    default: 'draf',
    comment:
      'Status dokumen: draf=sedang dibuat, pending=menunggu TTD basah, pending_tte=menunggu Portal TTE, final=final TTD basah, final_tte=final dengan TTD elektronik',
  })
  status: 'draf' | 'pending' | 'pending_tte' | 'final' | 'final_tte';

  @Column('varchar', { length: 255, nullable: true })
  final_pdf: string;

  @Column('boolean', { default: false })
  english: boolean;

  @Column('text', {
    name: 'tanda_tangan',
    nullable: true,
    comment:
      'Metadata TTE: signature_id, doc_id, verification_url, signed_at (JSON)',
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
      'JSON snapshot: {persnum, nama, position_text, position_id} orang yang mengirim/finalize naskah pending (bisa delegasi). Di-refresh di kirim dengan konteks pemrakarsa (company/area/subArea/organization/abbreviation) untuk generasi nomor di tahap penandatanganan.',
    transformer: {
      to: (value: any) => (value ? JSON.stringify(value) : null),
      from: (value: string | null) => (value ? JSON.parse(value) : null),
    },
  })
  dikirimOleh: {
    persnum: string;
    nama: string;
    position_text: string;
    position_id?: string;
    /** Konteks pemrakarsa untuk generasi nomor di signing (diisi/refresh di kirim). */
    company?: string;
    area?: string;
    subArea?: string;
    organization?: string;
    abbreviation?: string;
  } | null;

  @Column('varchar', {
    name: 'created_by_position',
    length: 100,
    nullable: true,
  })
  createdByPosition: string | null;

  @Column('varchar', {
    name: 'draft_konsep_to_position_id',
    length: 50,
    nullable: true,
  })
  draftKonsepToPositionId: string | null;

  @Column('text', { name: 'catatan_konsep', nullable: true })
  catatanKonsep: string | null;

  // Garis Kewenangan (a.n.) — label pemberi kuasa di template signature.
  // Dipakai SDE (e.g. "Direktur Utama" atau "Direksi"). Null = tidak pakai a.n.
  @Column('varchar', { name: 'atas_nama', length: 150, nullable: true })
  atasNama: string | null;

  // Position id pemberi kuasa (untuk auto-tembusan + restore form). Null untuk Dirut ("Direksi").
  @Column('varchar', {
    name: 'atas_nama_position_id',
    length: 50,
    nullable: true,
  })
  atasNamaPositionId: string | null;

  // Naskah Lainnya — data penandatangan (jabatan, positionId, persnum).
  @Column('varchar', {
    name: 'penandatangan_jabatan',
    length: 150,
    nullable: true,
  })
  penandatanganJabatan: string | null;

  @Column('varchar', {
    name: 'penandatangan_position_id',
    length: 50,
    nullable: true,
  })
  penandatanganPositionId: string | null;

  @Column('int', { name: 'penandatangan_persnum', nullable: true })
  penandatanganPersnum: number | null;

  // Naskah Lainnya — rantai penandatangan (JSON array, dukung multiple penandatangan).
  // [{positionId, persnum, nama, jabatan}] urut = urutan tanda tangan.
  // Null = fallback ke single penandatangan (atasNama + penandatanganJabatan).
  @Column('text', {
    name: 'penandatangan_chain',
    nullable: true,
    comment:
      'JSON array penandatangan: [{positionId?, persnum?, nama, jabatan}] urut = urutan TTD. Null = pakai atasNama + penandatanganJabatan (legacy).',
    transformer: {
      to: (value: any) =>
        value && value.length ? JSON.stringify(value) : null,
      from: (value: string | null) => (value ? JSON.parse(value) : null),
    },
  })
  penandatanganChain:
    | { positionId?: string; persnum?: number; nama: string; jabatan: string }[]
    | null;

  // Naskah Lainnya — index penandatangan aktif saat fase tanda_tangan (1-based).
  // Null di luar fase signing. signing_index === N menandakan signer terakhir.
  @Column('int', { name: 'signing_index', nullable: true })
  signingIndex: number | null;

  // Naskah Lainnya — MinIO key artifact signed (QR-injected untuk Digital / upload
  // manual untuk Fisik). Terpisah dari `lampiran` asli (sumber re-render Digital).
  @Column('varchar', { name: 'signed_lampiran', length: 255, nullable: true })
  signedLampiran: string | null;

  // Naskah Lainnya — tahapan workflow & flag legal. Null pada baris existing/naskah dinas.
  @Column('varchar', { name: 'tahapan', length: 32, nullable: true })
  tahapan: string | null;

  @Column('boolean', { name: 'butuh_legal', default: false })
  butuhLegal: boolean;

  // Naskah Lainnya — catatan hasil pemeriksaan legal (HTML TinyMCE). Diisi saat kirim-approval-legal.
  @Column('text', {
    name: 'catatan_legal',
    nullable: true,
    comment:
      'Catatan hasil pemeriksaan legal (HTML TinyMCE). Diisi saat kirim-approval-legal.',
  })
  catatanLegal: string | null;

  // Naskah Lainnya — rantai approval berjenjang pilihan pemrakarsa (JSON array).
  // [{positionId, nama, jabatan}] — urutan array = urutan persetujuan.
  // Null/[] = pakai default workflow. Approver ≠ penandatangan.
  @Column('text', {
    name: 'approval_chain',
    nullable: true,
    comment:
      'JSON snapshot rantai approval berjenjang: [{positionId?, nama, jabatan}] urut = urutan setujui. Null = default workflow.',
    transformer: {
      to: (value: any) =>
        value && value.length ? JSON.stringify(value) : null,
      from: (value: string | null) => (value ? JSON.parse(value) : null),
    },
  })
  approvalChain:
    | { positionId?: string; nama: string; jabatan: string }[]
    | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
