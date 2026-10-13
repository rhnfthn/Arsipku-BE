import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

const jsonTextTransformer = {
  to: (value: unknown) => (value == null ? null : JSON.stringify(value)),
  from: (value: string | null) => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  },
};

@Entity('sde_masal_folder')
export class SdeMasalFolderEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  judul: string;

  @Column({
    name: 'parent_naskah_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  parentNaskahId: string | null;

  @Column({ type: 'date', nullable: true })
  tanggal: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  klasifikasi: string | null;

  @Column({
    name: 'klasifikasi_text',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  klasifikasiText: string | null;

  @Column({ name: 'pengirim_id', type: 'varchar', length: 100, nullable: true })
  pengirimId: string | null;

  @Column({
    name: 'pengirim_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  pengirimName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sifat: string | null;

  @Column({
    name: 'recipient_type',
    type: 'varchar',
    length: 20,
    default: 'EXTERNAL',
  })
  recipientType: 'EXTERNAL' | 'INTERNAL';

  @Column({ name: 'atas_nama', type: 'varchar', length: 150, nullable: true })
  atasNama: string | null;

  @Column({
    name: 'atas_nama_position_id',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  atasNamaPositionId: string | null;

  @Column({ name: 'konten_template', type: 'text', nullable: true })
  kontenTemplate: string | null;

  @Column({
    name: 'dynamic_variables',
    type: 'text',
    nullable: true,
    transformer: jsonTextTransformer,
  })
  dynamicVariables: string[];

  @Column({ name: 'original_file_url', type: 'text', nullable: true })
  originalFileUrl: string | null;

  @Column({ name: 'sign_option', type: 'varchar', length: 20, nullable: true })
  signOption: 'digsig' | 'qr_only' | 'ttd_basah' | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  // Position ID pembuat folder (scope per-akun)
  @Index('idx_sde_masal_folder_created_by')
  @Column({ name: 'created_by', type: 'varchar', length: 50, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
