import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
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

  @Column('uuid') usulanId: string;
  @Column('uuid') berkasId: string;
  @Column('simple-array') jenisAksesGranted: string[];
  @Column('date') berlakuHingga: Date;

  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => UsulanAksesBerkasEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usulanId' })
  usulan: UsulanAksesBerkasEntity;
}