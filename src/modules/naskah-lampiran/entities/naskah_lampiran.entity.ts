import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('naskah_lampiran')
@Index('idx_naskah_lampiran_id_naskah', ['id_naskah'])
export class NaskahLampiranEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  id_naskah: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  file_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  file_pdf: string;

  @Column({
    type: 'enum',
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA'],
    nullable: true,
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';

  @Column({ type: 'char', length: 36, nullable: true })
  temp_folder_id: string;

  @Column({ type: 'tinyint', default: 0 })
  is_temporary: number;
}
