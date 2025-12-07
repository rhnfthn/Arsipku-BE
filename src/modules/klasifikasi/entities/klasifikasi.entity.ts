import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('klasifikasi')
export class KlasifikasiEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 50 })
  klasifikasi: string;

  @Column({ type: 'boolean', default: true })
  aktif: boolean;
}
