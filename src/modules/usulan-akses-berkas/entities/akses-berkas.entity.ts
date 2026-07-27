import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Final entitlement — akses berkas yang sudah diterbitkan
 */
@Entity('usulan_akses_entitlement', { schema: 'navmail' })
@Index('idx_uab_ent_usulan', ['usulanId'])
@Index('idx_uab_ent_user', ['userPersnum'])
@Index('idx_uab_ent_berkas', ['berkasId'])
export class AksesBerkasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid') usulanId: string;
  @Column('int') userPersnum: number; // persnum user yang dapat akses
  @Column('uuid') berkasId: string;
  @Column('simple-array') permissions: string[]; // ['LIHAT','UNDUH']
  @Column('date') tanggalMulai: Date;
  @Column('date') tanggalSelesai: Date;
  @Column({ default: false }) isRevoked: boolean;
  @Column({ default: false }) isPenerimaTambahan: boolean; // true jika penerimaAksesTambahan

  @CreateDateColumn() createdAt: Date;
}