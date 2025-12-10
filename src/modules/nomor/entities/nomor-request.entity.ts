import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
