import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DigsigDocumentEntity } from './digsig-document.entity';

/**
 * Entity untuk penandatangan dokumen
 * Menyimpan list signer per dokumen dengan urutan TTD
 */
@Entity('digsig_document_signer')
@Index('idx_document', ['idDocument'])
@Index('idx_persnum', ['persnum'])
@Index('idx_status', ['status'])
export class DigsigDocumentSignerEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'id_document', type: 'varchar', length: 36 })
  idDocument: string;

  // ======== Urutan TTD ========
  @Column({ name: 'urutan', type: 'int' })
  urutan: number;

  // ======== Info Penandatangan ========
  @Column({ name: 'persnum', type: 'int' })
  persnum: number;

  @Column({ name: 'nik', type: 'varchar', length: 20, nullable: true })
  nik: string | null;

  @Column({ name: 'nama', type: 'varchar', length: 255, nullable: true })
  nama: string | null;

  @Column({ name: 'jabatan', type: 'varchar', length: 255, nullable: true })
  jabatan: string | null;

  @Column({ name: 'lokasi', type: 'varchar', length: 255, nullable: true })
  lokasi: string | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  // ======== Status TTD ========
  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'waiting', 'signed', 'rejected'],
    default: 'pending',
  })
  status: 'pending' | 'waiting' | 'signed' | 'rejected';

  // ======== Hasil TTD ========
  @Column({ name: 'signed_at', type: 'datetime', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'signature_id', type: 'varchar', length: 100, nullable: true })
  signatureId: string | null;

  @Column({ name: 'bsre_doc_id', type: 'varchar', length: 100, nullable: true })
  bsreDocId: string | null;

  @Column({ name: 'bsre_name_doc', type: 'varchar', length: 255, nullable: true })
  bsreNameDoc: string | null;

  // ======== Rejection ========
  @Column({ name: 'rejected_at', type: 'datetime', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'keterangan', type: 'text', nullable: true })
  keterangan: string | null;

  // ======== Audit ========
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ======== Relations ========
  @ManyToOne(() => DigsigDocumentEntity, (document) => document.signers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_document' })
  document: DigsigDocumentEntity;
}
