import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatusUsulan, JenisBerkas, DurasiPreset } from '../enums';
import type { LevelJabatan } from '../enums';

/**
 * Entity utama Usulan Akses Berkas
 * 
 * Alur: Sekretaris Pengusul → verifikasi managerial pengusul (1-3 jenjang)
 *      → Sekretaris Pemberi → pemilihan berkas → approval managerial pemberi (1-3 jenjang)
 *      → akses diterbitkan
 */
@Entity('usulan_akses_berkas', { schema: 'navmail' })
export class UsulanAksesBerkasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  nomorUsulan: string; // "UAB-2026-0045"

  // ── Jenis Berkas (BARU) ─────────────────────────────────────────
  @Column({ type: 'enum', enum: JenisBerkas, default: JenisBerkas.AKTIF })
  jenisBerkas: JenisBerkas; // AKTIF | INAKTIF

  // ── Pengusul & Pemberi ──────────────────────────────────────────
  @Column('int') pengusulPersnum: number; // persnum sekretaris pengusul
  @Column('int') divisiPengusulId: number; // organization_id divisi pengusul
  @Column('int') divisiPemberiId: number; // organization_id divisi pemberi (auto Corporate Secretary jika INAKTIF)

  // ── Detail Usulan ──────────────────────────────────────────────
  @Column('text') tujuanAkses: string;
  @Column({ type: 'enum', enum: DurasiPreset })
  durasiAkses: DurasiPreset; // usulan dari pengusul
  @Column({ type: 'enum', enum: DurasiPreset, nullable: true })
  durasiAksesDisetujui: DurasiPreset | null; // ditentukan Sekretaris Pemberi (LANGKAH 5)
  @Column('text', { nullable: true })
  catatanPerubahanDurasi: string | null;
  @Column('date', { nullable: true }) tanggalMulai: Date | null; // di-set saat AKSES_DITERBITKAN
  @Column('date', { nullable: true }) tanggalSelesai: Date | null; // = tanggalMulai + durasiAksesDisetujui
  @Column('date', { nullable: true }) customTanggalSelesai: Date | null; // tanggal berakhir custom dari pengusul (hanya untuk CUSTOM)
  @Column('simple-array') jenisAkses: string[]; // ['LIHAT','UNDUH']

  // ── Penerima Akses Tambahan ────────────────────────────────────
  @Column('simple-array', { nullable: true })
  penerimaAksesTambahan: number[] | null; // persnum user di divisi pengusul yang juga dapat akses (opsional)

  // ── Surat Usulan ───────────────────────────────────────────────
  @Column('varchar', { length: 255, nullable: true })
  suratUsulanFileId: string | null; // S3 file ID

  // ── Konfigurasi Verifikator (JSON array, auto-sort bottom-to-top) ──
  // levelJabatan: BOD tags (BOD, BOD-1, BOD-2, BOD-3) atau legacy AVP/VP/EVP
  @Column('json') verifikatorPengusul: {
    persnum: number;
    levelJabatan: LevelJabatan;
    urutan: number;
    catatan?: string; // catatan personal dari SE pengusul (hanya terlihat oleh verifikator ini & SE pengusul)
  }[];

  @Column('json', { nullable: true }) verifikatorPemberi: {
    persnum: number;
    levelJabatan: LevelJabatan;
    urutan: number;
    catatan?: string; // catatan personal dari SE pemberi (hanya terlihat oleh verifikator ini & SE pemberi)
  }[] | null;

  // ── Status ─────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: StatusUsulan,
    default: StatusUsulan.DRAFT,
  })
  status: StatusUsulan;

  // ── Catatan Revisi (untuk banner "Mode Revisi") ────────────────
  @Column('text', { nullable: true })
  catatanRevisiPengusul: string | null; // catatan dari managerial pengusul saat REVISI
  @Column('text', { nullable: true })
  catatanRevisiPemberi: string | null; // catatan dari managerial pemberi saat REVISI

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}