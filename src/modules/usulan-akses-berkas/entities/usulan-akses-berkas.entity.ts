import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
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
// PK komposit (id, tanggal) — tanggal adalah partition key (tabel dipartisi per tahun)
@Index('uq_usulan_akses_nomor', ['nomor_usulan', 'tanggal'], { unique: true })
export class UsulanAksesBerkasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @PrimaryColumn('date')
  tanggal: Date;

  @Column()
  nomor_usulan: string; // "UAB-2026-0045"

  // ── Jenis Berkas (BARU) ─────────────────────────────────────────
  @Column({ type: 'enum', enum: JenisBerkas, default: JenisBerkas.AKTIF })
  jenis_berkas: JenisBerkas; // AKTIF | INAKTIF

  // ── Pengusul & Pemberi ──────────────────────────────────────────
  @Column('int') pengusul_persnum: number; // persnum sekretaris pengusul
  @Column('int') divisi_pengusul_id: number; // organization_id divisi pengusul
  @Column('int') divisi_pemberi_id: number; // organization_id divisi pemberi (auto Corporate Secretary jika INAKTIF)

  // ── Detail Usulan ──────────────────────────────────────────────
  @Column('varchar', { length: 255, nullable: true })
  judul_usulan: string | null; // judul usulan (opsional)
  @Column('text') tujuan_akses: string;
  @Column({ type: 'enum', enum: DurasiPreset })
  durasi_akses: DurasiPreset; // usulan dari pengusul
  @Column({ type: 'enum', enum: DurasiPreset, nullable: true })
  durasi_akses_disetujui: DurasiPreset | null; // ditentukan Sekretaris Pemberi (LANGKAH 5)
  @Column('text', { nullable: true })
  catatan_perubahan_durasi: string | null;
  @Column('date', { nullable: true }) tanggal_mulai: Date | null; // di-set saat AKSES_DITERBITKAN
  @Column('date', { nullable: true }) tanggal_selesai: Date | null; // = tanggalMulai + durasiAksesDisetujui
  @Column('date', { nullable: true }) custom_tanggal_selesai: Date | null; // tanggal berakhir custom dari pengusul (hanya untuk CUSTOM)
  @Column('simple-array') jenis_akses: string[]; // ['LIHAT','UNDUH']

  // ── Penerima Akses Tambahan ────────────────────────────────────
  @Column('simple-array', { nullable: true })
  penerima_akses_tambahan: number[] | null; // persnum user di divisi pengusul yang juga dapat akses (opsional)

  // ── Surat Usulan ───────────────────────────────────────────────
  @Column('varchar', { length: 255, nullable: true })
  surat_usulan_file_id: string | null; // S3 file ID

  // ── Konfigurasi Verifikator (JSON array, auto-sort bottom-to-top) ──
  // levelJabatan: BOD tags (BOD, BOD-1, BOD-2, BOD-3) atau legacy AVP/VP/EVP
  @Column('json') verifikator_pengusul: {
    persnum: number;
    level_jabatan: LevelJabatan;
    urutan: number;
    catatan?: string; // catatan personal dari SE pengusul (hanya terlihat oleh verifikator ini & SE pengusul)
  }[];

  @Column('json', { nullable: true }) verifikator_pemberi: {
    persnum: number;
    level_jabatan: LevelJabatan;
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
  catatan_revisi_pengusul: string | null; // catatan dari managerial pengusul saat REVISI
  @Column('text', { nullable: true })
  catatan_revisi_pemberi: string | null; // catatan dari managerial pemberi saat REVISI

  // ── Tracking Viewed (untuk badge notifikasi) ──────────────────────
  // Map persnum (string) → ISO timestamp. Di-set saat user (SE/managerial)
  // membuka detail usulan. Counts badge akan exclude usulan yang sudah
  // viewed oleh user tsb (sama dengan pola send_read_time di naskah_sirkulasi).
  @Column('json', { nullable: true })
  viewed_by: { [persnum: string]: string } | null;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}