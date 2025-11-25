import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('disposisi_item')
export class DisposisiItemEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  @Column({ type: 'int' })
  urutan: number;

  @Column({ type: 'boolean', default: true })
  aktif: boolean;
}
