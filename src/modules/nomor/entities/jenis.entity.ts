import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('jenis')
export class JenisEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('varchar', { length: 20, nullable: true })
  jenis: string | null;

  @Column('varchar', { name: 'jenis_text', length: 255, nullable: true })
  jenisText: string | null;

  @Column('varchar', { name: 'file_name', length: 255, nullable: true })
  fileName: string | null;

  @Column('varchar', { name: 'file_text', length: 255, nullable: true })
  fileText: string | null;

  @Column('varchar', { name: 'file_original', length: 255, nullable: true })
  fileOriginal: string | null;

  @Column('varchar', { name: 'file_regex', length: 255, nullable: true })
  fileRegex: string | null;

  @Column('text', { name: 'format_penomoran', nullable: true })
  formatPenomoran: string | null;

  @Column('tinyint', { width: 1, default: 1 })
  active: number;
}
