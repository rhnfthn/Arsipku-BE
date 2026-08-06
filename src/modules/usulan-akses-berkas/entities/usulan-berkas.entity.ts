import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UsulanAksesBerkasEntity } from './usulan-akses-berkas.entity';

/**
 * Berkas-berkas yang dipilih oleh Sekretaris Pemberi untuk diberikan aksesnya
 */
@Entity('usulan_akses_berkas_item', { schema: 'navmail' })
@Index('idx_uab_item_usulan', ['usulanId'])
@Index('idx_uab_item_berkas', ['berkasId'])
export class UsulanBerkasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('uuid') usulanId: string;
  @Column('uuid') berkasId: string;
  @Column('simple-array') jenisAksesGranted: string[];
  /**
   * NOT NULL di DB.
   * Pakai sentinel BERLAKU_HINGGA_SENTINEL ('9999-12-31') saat berkas baru dipilih
   * sebelum akses diterbitkan. Di-overwrite dengan tanggal sebenarnya
   * saat `terbitkanAkses()` jalan (lihat usulan-akses-berkas.service.ts).
   * Alasan: user DB aplikasi tidak punya ALTER privilege, jadi kolom tidak bisa dibuat nullable.
   */
  @Column('date') berlakuHingga: Date;

  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => UsulanAksesBerkasEntity, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false, // FK di-drop utk partisi; cascade via app (usulan tak pernah dihapus)
  })
  @JoinColumn({ name: 'usulanId' })
  usulan: UsulanAksesBerkasEntity;
}