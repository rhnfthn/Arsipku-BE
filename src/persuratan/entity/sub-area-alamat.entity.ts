import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('sub_area_alamat')
export class SubAreaAlamatEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'date', nullable: true })
  start_date: Date;

  @Column({ type: 'date', nullable: true })
  end_date: Date;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 50 })
  area: string;

  @Column({ type: 'varchar', length: 50 })
  sub_area: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kantor: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kantor_english: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gedung: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gedung_english: string;

  @Column({ type: 'text', nullable: true })
  alamat: string;

  @Column({ type: 'text', nullable: true })
  alamat_english: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telepon: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logo: string;
}
