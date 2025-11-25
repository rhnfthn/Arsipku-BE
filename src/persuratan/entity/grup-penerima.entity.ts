import { Entity, Column, PrimaryColumn, OneToMany, JoinColumn } from 'typeorm';
import { GrupPenerimaDetailEntity } from './grup-penerima-detail.entity';

@Entity('grup_penerima')
export class GrupPenerimaEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 50 })
  area: string;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  @Column({ type: 'text', nullable: true })
  deskripsi: string;

  @Column({ type: 'text', nullable: true })
  deskripsi_english: string;

  @Column({ type: 'int', nullable: true })
  urutan: number;

  @Column({ type: 'boolean', default: true })
  aktif: boolean;

  @OneToMany(() => GrupPenerimaDetailEntity, (detail) => detail.grupPenerima, {
    cascade: true,
  })
  @JoinColumn({ name: 'id' })
  details: GrupPenerimaDetailEntity[];
}
