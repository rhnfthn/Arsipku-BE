import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('naskah_lampiran')
export class NaskahLampiranEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  id_naskah: string | null;

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

  @Column({ type: 'tinyint', width: 1, default: 0, nullable: true })
  is_temporary: number;

  @Column({ type: 'char', length: 36, nullable: true })
  temp_folder_id: string | null;

  @Column({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
