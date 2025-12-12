import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('nomor')
export class NomorEntity {
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

  @Column('int', { nullable: true })
  tahun: number | null;

  @Column('varchar', { length: 20, nullable: true })
  jenis: string | null;

  @Column('varchar', { length: 100, nullable: true })
  nomor: string | null;

  @Column('char', { name: 'id_request', length: 36, nullable: true })
  idRequest: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
