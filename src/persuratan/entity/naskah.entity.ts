import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('naskah')
export class NaskahEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({
    type: 'enum',
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA'],
    nullable: true,
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';

  @Column({ type: 'varchar', length: 50, nullable: true })
  klasifikasi: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  klasifikasi_text: string;

  @Column({
    type: 'enum',
    enum: ['sangat_rahasia', 'rahasia', 'terbatas', 'terbuka'],
    nullable: true,
  })
  sifat: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'terbuka';

  @Column({ type: 'varchar', length: 100, nullable: true })
  nomor: string;

  @Column({ type: 'date', nullable: true })
  tanggal: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lampiran: string;

  @Column({ type: 'text', nullable: true })
  perihal: string;

  @Column({ type: 'text', nullable: true })
  konten: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tempat: string;

  @Column({
    type: 'enum',
    enum: ['draf', 'final', 'final_tte'],
    nullable: true,
  })
  status: 'draf' | 'final' | 'final_tte';

  @Column({ type: 'varchar', length: 255, nullable: true })
  final_pdf: string;

  @Column({ type: 'boolean', default: false })
  english: boolean;
}
