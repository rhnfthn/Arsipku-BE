import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entity untuk tabel 'konsep'
 * Menyimpan workflow konsep naskah (ND/SDI/SDE)
 *
 * Konsep adalah draft naskah yang dibuat oleh bawahan (konseptor)
 * yang kemudian dikirim ke atasan (pemeriksa/pengirim) untuk review/approval
 */
@Entity('konsep')
export class KonsepEntity {
  @PrimaryColumn('char', { name: 'id', length: 36 })
  id: string;

  @Column('varchar', { name: 'company', length: 50, nullable: true })
  company: string | null;

  @Column('char', { name: 'id_naskah', length: 36, nullable: true })
  @Index('idx_konsep_id_naskah')
  idNaskah: string | null;

  @Column({
    type: 'enum',
    enum: ['ND', 'SDI', 'SDE'],
    nullable: true,
  })
  jenis: 'ND' | 'SDI' | 'SDE' | null;

  // =========================
  // FROM (PENGIRIM / KONSEPTOR / PEMERIKSA)
  // =========================
  @Column('varchar', { name: 'from_area', length: 50, nullable: true })
  fromArea: string | null;

  @Column('varchar', { name: 'from_area_text', length: 150, nullable: true })
  fromAreaText: string | null;

  @Column('varchar', { name: 'from_sub_area', length: 50, nullable: true })
  fromSubArea: string | null;

  @Column('varchar', {
    name: 'from_sub_area_text',
    length: 150,
    nullable: true,
  })
  fromSubAreaText: string | null;

  @Column('varchar', { name: 'from_organization', length: 100, nullable: true })
  fromOrganization: string | null;

  @Column('varchar', {
    name: 'from_organization_text',
    length: 150,
    nullable: true,
  })
  fromOrganizationText: string | null;

  @Column('varchar', { name: 'from_position', length: 100, nullable: true })
  fromPosition: string | null;

  @Column('varchar', {
    name: 'from_position_text',
    length: 150,
    nullable: true,
  })
  fromPositionText: string | null;

  @Column({
    type: 'enum',
    name: 'from_position_status',
    enum: ['ybs', 'pt', 'ph'],
    nullable: true,
  })
  fromPositionStatus: 'ybs' | 'pt' | 'ph' | null;

  @Column('varchar', { name: 'from_id_sirkuler', length: 50, nullable: true })
  fromIdSirkuler: string | null;

  @Column('varchar', {
    name: 'from_nama_sirkuler',
    length: 150,
    nullable: true,
  })
  fromNamaSirkuler: string | null;

  @Column('varchar', { name: 'from_telepon', length: 50, nullable: true })
  fromTelepon: string | null;

  @Column('varchar', { name: 'from_email', length: 150, nullable: true })
  fromEmail: string | null;

  @Column('varchar', { name: 'from_actor', length: 50, nullable: true })
  fromActor: string | null; // 'pembuat' atau 'penerus'

  // =========================
  // TO (PENERIMA / PEMERIKSA / PENGIRIM)
  // =========================
  @Column('varchar', { name: 'to_area', length: 50, nullable: true })
  toArea: string | null;

  @Column('varchar', { name: 'to_area_text', length: 150, nullable: true })
  toAreaText: string | null;

  @Column('varchar', { name: 'to_sub_area', length: 50, nullable: true })
  toSubArea: string | null;

  @Column('varchar', { name: 'to_sub_area_text', length: 150, nullable: true })
  toSubAreaText: string | null;

  @Column('varchar', { name: 'to_organization', length: 100, nullable: true })
  toOrganization: string | null;

  @Column('varchar', {
    name: 'to_organization_text',
    length: 150,
    nullable: true,
  })
  toOrganizationText: string | null;

  @Column('varchar', { name: 'to_position', length: 100, nullable: true })
  toPosition: string | null;

  @Column('varchar', { name: 'to_position_text', length: 150, nullable: true })
  toPositionText: string | null;

  @Column({
    type: 'enum',
    name: 'to_position_status',
    enum: ['ybs', 'pt', 'ph'],
    nullable: true,
  })
  toPositionStatus: 'ybs' | 'pt' | 'ph' | null;

  @Column('varchar', { name: 'to_id_sirkuler', length: 50, nullable: true })
  toIdSirkuler: string | null;

  @Column('varchar', { name: 'to_nama_sirkuler', length: 150, nullable: true })
  toNamaSirkuler: string | null;

  @Column('varchar', { name: 'to_telepon', length: 50, nullable: true })
  toTelepon: string | null;

  @Column('varchar', { name: 'to_email', length: 150, nullable: true })
  toEmail: string | null;

  @Column('varchar', { name: 'to_actor', length: 50, nullable: true })
  toActor: string | null; // 'penerima'

  // =========================
  // CATATAN & STATUS
  // =========================
  @Column('text', { name: 'catatan', nullable: true })
  catatan: string | null;

  // =========================
  // DATA SURAT FINAL (untuk naskah_sirkulasi setelah finalize)
  // =========================
  @Column('varchar', {
    name: 'pengirim_position_id',
    length: 100,
    nullable: true,
  })
  pengirimPositionId: string | null; // Position ID penandatangan surat

  @Column('text', { name: 'penerima_position_ids', nullable: true })
  penerimaPositionIds: string | null; // JSON array: ["12345", "67890"]

  @Column('text', { name: 'tembusan_position_ids', nullable: true })
  tembusanPositionIds: string | null; // JSON array: ["11111", "22222"]

  @Column('datetime', { name: 'send_read_time', nullable: true })
  sendReadTime: Date | null;

  @Column('varchar', { name: 'send_read_user', length: 100, nullable: true })
  sendReadUser: string | null;

  @Column('char', { name: 'id_label', length: 36, nullable: true })
  idLabel: string | null;

  @Column('tinyint', { name: 'flag_favorit', default: 0 })
  flagFavorit: number;

  @Column('tinyint', { name: 'flag_note', default: 0 })
  flagNote: number;

  @Column('tinyint', { name: 'flag_arsip', default: 0 })
  flagArsip: number;

  @CreateDateColumn({ name: 'create_at' })
  createAt: Date;

  @UpdateDateColumn({ name: 'update_at' })
  updateAt: Date;
}
