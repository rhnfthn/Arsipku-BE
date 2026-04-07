import { Entity, Column, PrimaryColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { NomorRequestDetailEntity } from './nomor-request-detail.entity';

@Entity('nomor_request')
export class NomorRequestEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('varchar', { length: 50, nullable: true })
  company: string | null;

  @Column('varchar', { length: 50, nullable: true })
  area: string | null;

  @Column('varchar', { name: 'sub_area', length: 50, nullable: true })
  subArea: string | null;

  @Column('varchar', { length: 50, nullable: true })
  organization: string | null;

  @Column('varchar', { length: 50, nullable: true })
  position: string | null;

  @Column('date', { nullable: true })
  tanggal: Date | null;

  @Column('varchar', { length: 20, nullable: true })
  jenis: string | null;

  @Column('varchar', { length: 50, nullable: true })
  klasifikasi: string | null;

  @Column('text', { nullable: true })
  perihal: string | null;

  @Column('int', { nullable: true })
  jumlah: number | null;

  @Column('varchar', { length: 255, nullable: true })
  penandatangan: string | null;

  @Column('int', { name: 'id_position_penandatangan', nullable: true })
  idPositionPenandatangan: number | null;

  @Column('tinyint', { name: 'is_single_file', width: 1, default: 0 })
  isSingleFile: number;

  @Column('tinyint', {
    name: 'is_naskah_generated',
    width: 1,
    nullable: true,
    default: null,
  })
  isNaskahGenerated: boolean | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => NomorRequestDetailEntity, (detail) => detail.request, { eager: false })
  details?: NomorRequestDetailEntity[];
}
