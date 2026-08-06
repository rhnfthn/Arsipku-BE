import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UsulanAksesBerkasEntity } from './usulan-akses-berkas.entity';

/**
 * Audit trail untuk setiap langkah verifikasi/persetujuan
 */
@Entity('usulan_akses_verification_step', { schema: 'navmail' })
@Index('idx_uab_step_usulan', ['usulanId'])
@Index('idx_uab_step_verifier', ['verifierPersnum'])
export class VerificationStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @PrimaryColumn('date')
  tanggal: Date;

  @Column('uuid') usulanId: string;
  @Column('int') verifierPersnum: number;
  @Column('varchar', { length: 50 }) roleTahap: string; // 'AVP_PENGUSUL', 'EVP_PEMBERI', dll
  @Column({ type: 'tinyint' })
  urutanJenjang: 0 | 1 | 2 | 3; // 0=Sekretaris, 1=AVP, 2=VP, 3=EVP
  @Column('varchar', { length: 20 }) keputusan: string; // 'SETUJU'|'TOLAK'|'REVISI'|'LANJUT'
  @Column('text', { nullable: true }) catatan: string | null;
  @Column('text', { nullable: true }) catatanRevisi: string | null; // wajib jika keputusan=REVISI
  @Column('text', { nullable: true }) catatanKeSE: string | null; // catatan khusus dari verifikator ke SE-nya (saat TOLAK/REVISI)
  @Column('json', { nullable: true, default: '{}' }) checklist: Record<string, boolean> | null;
  @CreateDateColumn() verifiedAt: Date;

  @ManyToOne(() => UsulanAksesBerkasEntity, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false, // FK di-drop utk partisi; cascade via app (usulan tak pernah dihapus)
  })
  @JoinColumn({ name: 'usulanId' })
  usulan: UsulanAksesBerkasEntity;
}