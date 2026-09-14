import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('sde_masal')
export class SdeMasalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_sde_masal_folder')
  @Column({ name: 'folder_id', type: 'char', length: 36, nullable: true })
  folderId: string | null;

  @Column({ name: 'recipient_data', type: 'text', nullable: true })
  recipientData: string | null;

  @Index('idx_sde_masal_status')
  @Column({
    name: 'status_verifikasi',
    type: 'varchar',
    length: 20,
    default: 'MENUNGGU',
  })
  statusVerifikasi: string;

  @Column({ name: 'naskah_id', type: 'char', length: 36, nullable: true })
  naskahId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'verifikators', type: 'json', nullable: true })
  verifikators: any[] | null;

  @Column({ name: 'current_verifikator_urutan', type: 'int', nullable: true })
  currentVerifikatorUrutan: number | null;

  @Column({ name: 'submitted_at', type: 'datetime', nullable: true })
  submittedAt: Date | null;

  // Position ID pembuat item (scope per-akun)
  @Index('idx_sde_masal_created_by')
  @Column({ name: 'created_by', type: 'varchar', length: 50, nullable: true })
  createdBy: string | null;

  // Lampiran per item (MinIO key, format pdf/zip)
  @Column({ name: 'lampiran', type: 'text', nullable: true })
  lampiran: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
