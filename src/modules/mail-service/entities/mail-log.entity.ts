import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('mail_log')
export class MailLogEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // Denormalisasi naskah.tanggal — kunci partisi RANGE(YEAR(tanggal)), bagian PK komposit (id, tanggal)
  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('char', { length: 36, nullable: true })
  naskah_id: string | null;

  @Column('varchar', { length: 10, nullable: true })
  jenis_naskah: string | null;

  @Column('varchar', { length: 100, nullable: true })
  nomor_surat: string | null;

  @Column('varchar', { length: 200, nullable: true })
  perihal: string | null;

  @Column('varchar', { length: 255 })
  subjek: string;

  @Column('varchar', { length: 50 })
  from_as: string;

  @Column('text')
  to: string;

  @Column('text', { nullable: true })
  cc: string | null;

  @Column('text', { nullable: true })
  bcc: string | null;

  @Column('int', { nullable: true })
  lampiran_count: number | null;

  @Column('varchar', { length: 50 })
  status: string; // success | failed

  @Column('text', { nullable: true })
  error_message: string | null;

  @Column('text', { nullable: true })
  api_response: string | null;

  @Column('varchar', { length: 100, nullable: true })
  sender_persnum: string | null;

  @Column('varchar', { length: 255, nullable: true })
  sender_nama: string | null;

  @CreateDateColumn({
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;
}
