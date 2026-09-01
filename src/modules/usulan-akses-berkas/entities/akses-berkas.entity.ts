import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Final entitlement — akses berkas yang sudah diterbitkan
 */
@Entity('usulan_akses_entitlement', { schema: 'navmail' })
@Index('idx_uab_ent_usulan', ['usulan_id'])
@Index('idx_uab_ent_user', ['user_persnum'])
@Index('idx_uab_ent_berkas', ['berkas_id'])
export class AksesBerkasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @PrimaryColumn('date')
  tanggal: Date;

  @Column('uuid') usulan_id: string;
  @Column('int') user_persnum: number; // persnum user yang dapat akses
  @Column('uuid') berkas_id: string;
  @Column('simple-array') permissions: string[]; // ['LIHAT','UNDUH']
  @Column('date') tanggal_mulai: Date;
  @Column('date') tanggal_selesai: Date;
  @Column({ default: false }) is_revoked: boolean;
  @Column({ default: false }) is_penerima_tambahan: boolean; // true jika penerimaAksesTambahan
  @Column({ default: false }) is_read: boolean; // true jika user sudah membuka halaman Pemberian

  @CreateDateColumn() created_at: Date;
}