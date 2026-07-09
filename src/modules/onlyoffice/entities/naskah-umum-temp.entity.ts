import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('naskah_umum_temp')
export class NaskahUmumTempEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  jenis: string;

  @Column({ name: 'fields_json', type: 'text' })
  fieldsJson: string; // JSON.stringify(PreviewDto.fields)

  @Column({ name: 's3_key', type: 'varchar', length: 255 })
  s3Key: string; // filled docx (pre-edit)

  @Column({ name: 's3_key_saved', type: 'varchar', length: 255, nullable: true })
  s3KeySaved: string | null; // post-edit docx (from callback)

  @Column({ type: 'varchar', length: 20, default: 'preview' })
  status: 'preview' | 'saved' | 'sent';

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
