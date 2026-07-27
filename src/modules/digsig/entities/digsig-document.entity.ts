import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { DigsigDocumentSignerEntity } from './digsig-document-signer.entity';

/**
 * Entity untuk dokumen yang akan ditandatangani digital
 * Digunakan di fitur "Penandatanganan" menu Digsig
 */
@Entity('digsig_document')
@Index('idx_status', ['status'])
@Index('idx_created_by', ['createdBy'])
@Index('idx_tanggal', ['tanggalDokumen'])
@Index('idx_jenis', ['jenisNaskah'])
export class DigsigDocumentEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  // ======== Informasi Dokumen ========
  @Column({ name: 'tanggal_dokumen', type: 'date' })
  tanggalDokumen: Date;

  @Column({ name: 'klasifikasi', type: 'varchar', length: 50, nullable: true })
  klasifikasi: string | null;

  @Column({
    name: 'klasifikasi_text',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  klasifikasiText: string | null;

  @Column({ name: 'jenis_naskah', type: 'varchar', length: 50 })
  jenisNaskah: string;

  @Column({ name: 'nomor_dokumen', type: 'varchar', length: 150 })
  nomorDokumen: string;

  @Column({ name: 'perihal', type: 'text', nullable: true })
  perihal: string | null;

  // ======== File Info ========
  @Column({ name: 'file_path', type: 'varchar', length: 500, nullable: true })
  filePath: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  @Column({
    name: 'file_mime_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  fileMimeType: string | null;

  // ======== Signed File ========
  @Column({
    name: 'signed_file_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  signedFilePath: string | null;

  @Column({
    name: 'signed_file_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  signedFileName: string | null;

  // ======== Options ========
  @Column({ name: 'visible_sign', type: 'tinyint', default: 0 })
  visibleSign: number;

  // ======== Status ========
  @Column({
    name: 'status',
    type: 'enum',
    enum: ['on_progress', 'completed', 'rejected', 'cancelled'],
    default: 'on_progress',
  })
  status: 'on_progress' | 'completed' | 'rejected' | 'cancelled';

  @Column({ name: 'current_signer_order', type: 'int', default: 1 })
  currentSignerOrder: number;

  @Column({ name: 'total_signers', type: 'int', default: 0 })
  totalSigners: number;

  // ======== Rejection Info ========
  @Column({ name: 'rejected_by', type: 'int', nullable: true })
  rejectedBy: number | null;

  @Column({ name: 'rejected_at', type: 'datetime', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  // ======== Audit ========
  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdByName: string | null;

  @Column({
    name: 'created_by_position',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdByPosition: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ======== Relations ========
  @OneToMany(() => DigsigDocumentSignerEntity, (signer) => signer.document)
  signers: DigsigDocumentSignerEntity[];
}
