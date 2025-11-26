import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('naskah_referensi')
export class NaskahReferensiEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  id_naskah: string;

  @Column({
    type: 'enum',
    enum: ['ND', 'SDI', 'SDE'],
    nullable: true,
  })
  ref_jenis: 'ND' | 'SDI' | 'SDE';

  @Column({ type: 'varchar', length: 150, nullable: true })
  ref_pengirim: string;

  @Column({ type: 'date', nullable: true })
  ref_tanggal: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ref_nomor: string;

  @Column({ type: 'text', nullable: true })
  ref_perihal: string;
}
