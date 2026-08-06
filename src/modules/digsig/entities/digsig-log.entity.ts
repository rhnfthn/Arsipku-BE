import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity untuk menyimpan log aktivitas digital signature
 * Mencatat semua aktivitas sign, verify, upload, download
 */
@Entity('digsig_log')
export class DigsigLogEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Index('idx_digsig_log_tanggal')
  // Tanggal penandatanganan — kunci partisi RANGE(YEAR(tanggal)), bagian PK komposit (id, tanggal).
  // Pakai tanggal existing (bukan naskah.tanggal): log audit diarsipkan per tahun kejadiannya.
  @PrimaryColumn('datetime', { name: 'tanggal', default: () => 'CURRENT_TIMESTAMP' })
  tanggal: Date;

  @Column('varchar', { name: 'ip_address', length: 50, nullable: true })
  ipAddress: string | null;

  @Index('idx_digsig_log_user')
  @Column('int', { name: 'user_persnum' })
  userPersnum: number;

  @Column('varchar', { name: 'user_name', length: 150, nullable: true })
  userName: string | null;

  @Column('varchar', { name: 'api_endpoint', length: 100 })
  apiEndpoint: string;

  @Index('idx_digsig_log_naskah')
  @Column('char', { name: 'id_naskah', length: 36, nullable: true })
  idNaskah: string | null;

  @Column('varchar', { name: 'nomor_naskah', length: 100, nullable: true })
  nomorNaskah: string | null;

  @Column('varchar', {
    name: 'jenis_naskah',
    length: 100,
    nullable: true,
  })
  jenisNaskah: string | null;

  @Column('enum', {
    name: 'action',
    enum: ['sign', 'verify', 'download', 'upload'],
  })
  action: 'sign' | 'verify' | 'download' | 'upload';

  @Index('idx_digsig_log_status')
  @Column('enum', {
    name: 'status',
    enum: ['sukses', 'gagal', 'pending'],
    default: 'pending',
  })
  status: 'sukses' | 'gagal' | 'pending';

  @Column('varchar', { name: 'note', length: 255, nullable: true })
  note: string | null;

  @Column('json', { name: 'bsre_response', nullable: true })
  bsreResponse: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
