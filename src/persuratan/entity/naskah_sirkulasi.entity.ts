import { Column, Entity, UpdateDateColumn } from 'typeorm';

@Entity('naskah_sirkulasi', { schema: 'navmail' })
export class NaskahSirkulasi {
  @Column('varchar', { primary: true, name: 'id', length: 36 })
  id: string;

  @Column('char', { name: 'id_naskah', nullable: true, length: 36 })
  idNaskah: string | null;

  @Column('enum', {
    name: 'sirkuler',
    nullable: true,
    enum: ['pengirim', 'penerima', 'tembusan'],
  })
  sirkuler: 'pengirim' | 'penerima' | 'tembusan' | null;

  @Column('enum', {
    name: 'position_status',
    nullable: true,
    enum: ['pyb', 'pt', 'ph', 'ext'],
  })
  positionStatus: 'pyb' | 'pt' | 'ph' | 'ext' | null;

  @Column('char', { name: 'id_sirkuler', nullable: true, length: 36 })
  idSirkuler: string | null;

  @Column('varchar', { name: 'alamat', nullable: true, length: 255 })
  alamat: string | null;

  @Column('char', { name: 'id_grup_penerima', nullable: true, length: 36 })
  idGrupPenerima: string | null;

  @Column('datetime', { name: 'send_read_time', nullable: true })
  sendReadTime: Date | null;

  @Column('char', { name: 'id_label', nullable: true, length: 36 })
  idLabel: string | null;

  @Column('tinyint', {
    name: 'flag_favorit',
    nullable: true,
    default: 0,
    width: 1,
  })
  flagFavorit: number | null;

  @Column('tinyint', {
    name: 'flag_note',
    nullable: true,
    default: 0,
    width: 1,
  })
  flagNote: number | null;

  @Column('tinyint', {
    name: 'flag_arsip',
    nullable: true,
    default: 0,
    width: 1,
  })
  flagArsip: number | null;

  @Column('varchar', { name: 'company_text', nullable: true, length: 255 })
  companyText: string | null;

  @Column('varchar', { name: 'area_text', nullable: true, length: 255 })
  areaText: string | null;

  @Column('varchar', { name: 'sub_area_text', nullable: true, length: 255 })
  subAreaText: string | null;

  @Column('varchar', {
    name: 'organization_text',
    nullable: true,
    length: 255,
  })
  organizationText: string | null;

  @Column('varchar', { name: 'position_text', nullable: true, length: 255 })
  positionText: string | null;

  @Column('varchar', { name: 'nama_sirkuler', nullable: true, length: 255 })
  namaSirkuler: string | null;

  @Column('datetime', {
    name: 'create_at',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createAt: Date | null;

  @UpdateDateColumn({ name: 'update_at', type: 'datetime', precision: 6 })
  updateAt: Date | null;

  @Column('varchar', { name: 'uname', nullable: true, length: 11 })
  uname: string | null;

  @Column('int', { name: 'company', nullable: true })
  company: number | null;

  @Column('varchar', { name: 'area', nullable: true, length: 11 })
  area: string | null;

  @Column('varchar', { name: 'sub_area', nullable: true, length: 11 })
  subArea: string | null;

  @Column('varchar', { name: 'organization', nullable: true, length: 8 })
  organization: string | null;

  @Column('varchar', { name: 'position', nullable: true, length: 8 })
  position: string | null;

  @Column('varchar', { name: 'telepon', nullable: true, length: 50 })
  telepon: string | null;

  @Column('varchar', { name: 'email', nullable: true, length: 100 })
  email: string | null;

  @Column('varchar', { name: 'send_read_user', nullable: true, length: 50 })
  sendReadUser: string | null;
}
