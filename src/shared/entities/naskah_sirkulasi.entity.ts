import { Column, Entity, CreateDateColumn, UpdateDateColumn, PrimaryColumn } from 'typeorm';

@Entity('naskah_sirkulasi')
export class NaskahSirkulasi {
  @PrimaryColumn('char', { primary: true, name: 'id', length: 36 })
  id: string;

  // Denormalisasi naskah.tanggal — kunci partisi RANGE(YEAR(tanggal)), bagian PK komposit (id, tanggal)
  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('char', { name: 'id_naskah', nullable: true, length: 36 })
  idNaskah: string | null;

  @Column('enum', {
    name: 'sirkuler',
    nullable: true,
    enum: ['pengirim', 'penerima', 'tembusan'],
  })
  sirkuler: 'pengirim' | 'penerima' | 'tembusan' | null;

  @Column('varchar', { name: 'company', nullable: true, length: 50 })
  company: string | null;

  @Column('varchar', { name: 'company_text', nullable: true, length: 100 })
  companyText: string | null;

  @Column('varchar', { name: 'area', nullable: true, length: 50 })
  area: string | null;

  @Column('varchar', { name: 'area_text', nullable: true, length: 100 })
  areaText: string | null;

  @Column('varchar', { name: 'sub_area', nullable: true, length: 50 })
  subArea: string | null;

  @Column('varchar', { name: 'sub_area_text', nullable: true, length: 100 })
  subAreaText: string | null;

  @Column('varchar', { name: 'organization', nullable: true, length: 100 })
  organization: string | null;

  @Column('varchar', { name: 'organization_text', nullable: true, length: 150 })
  organizationText: string | null;

  @Column('varchar', { name: 'position', nullable: true, length: 100 })
  position: string | null;

  @Column('varchar', { name: 'position_text', nullable: true, length: 150 })
  positionText: string | null;

  @Column('enum', {
    name: 'position_status',
    nullable: true,
    enum: ['ybs', 'pt', 'ph', 'ps', 'se', 'vi', 'ext'],
    comment:
      'ybs=definitif/interim, pt=pelaksana tugas, ph=pelaksana harian, ps=penugasan sementara, se=sekretaris, vi=viewer, ext=external',
  })
  positionStatus: 'ybs' | 'pt' | 'ph' | 'ps' | 'se' | 'vi' | 'ext' | null;

  @Column('char', { name: 'id_sirkuler', nullable: true, length: 36 })
  idSirkuler: string | null;

  @Column('varchar', { name: 'nama_sirkuler', nullable: true, length: 150 })
  namaSirkuler: string | null;

  @Column('varchar', { name: 'alamat', nullable: true, length: 255 })
  alamat: string | null;

  @Column('varchar', { name: 'telepon', nullable: true, length: 50 })
  telepon: string | null;

  @Column('varchar', { name: 'email', nullable: true, length: 150 })
  email: string | null;

  @Column('char', { name: 'id_grup_penerima', nullable: true, length: 36 })
  idGrupPenerima: string | null;

  @Column('datetime', { name: 'send_read_time', nullable: true })
  sendReadTime: Date | null;

  @Column('varchar', { name: 'send_read_user', nullable: true, length: 100 })
  sendReadUser: string | null;

  @Column('char', { name: 'id_label', nullable: true, length: 36 })
  idLabel: string | null;

  @Column('tinyint', { name: 'flag_favorit', nullable: true, default: 0 })
  flagFavorit: number | null;

  @Column('tinyint', { name: 'flag_note', nullable: true, default: 0 })
  flagNote: number | null;

  @Column('text', { name: 'note_text', nullable: true })
  noteText: string | null;

  @Column('tinyint', { name: 'flag_arsip', nullable: true, default: 0 })
  flagArsip: number | null;

  @Column('tinyint', {
    name: 'tindak_lanjut',
    nullable: true,
    default: 0,
    comment: 'Flag tindak lanjut: 0=belum, 1=sudah',
  })
  tindakLanjut: number | null;

  @Column('boolean', { name: 'is_draft', nullable: true, default: false })
  isDraft: boolean | null;

  @Column('int', { name: 'urutan', nullable: true, default: 0 })
  urutan: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
