import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Entity untuk tabel 'di' (Disposisi)
 * Menyimpan konten lengkap lembar disposisi
 */
@Entity('di', { schema: 'navmail' })
export class DiEntity {
  @PrimaryColumn('char', { name: 'id', length: 36 })
  id: string;

  @Column('char', { name: 'id_naskah', length: 36, nullable: true })
  @Index('idx_di_id_naskah')
  idNaskah: string | null;

  // Kop Naskah
  @Column('varchar', { name: 'kop_logo', length: 255, nullable: true })
  kopLogo: string | null;

  @Column('varchar', { name: 'kop_judul', length: 150, nullable: true })
  kopJudul: string | null;

  // Penandatangan
  @Column('varchar', { name: 'nama_jabatan', length: 150, nullable: true })
  namaJabatan: string | null;

  // Nomor Agenda
  @Column('varchar', { name: 'nomor_agenda', length: 100, nullable: true })
  nomorAgenda: string | null;

  @Column('date', { name: 'tanggal_agenda', nullable: true })
  tanggalAgenda: Date | null;

  // Referensi Surat
  @Column('varchar', { name: 'surat_dari', length: 150, nullable: true })
  suratDari: string | null;

  @Column('date', { name: 'tanggal', nullable: true })
  tanggal: Date | null;

  @Column('varchar', { name: 'nomor', length: 100, nullable: true })
  nomor: string | null;

  @Column('text', { name: 'perihal', nullable: true })
  perihal: string | null;

  @Column('varchar', { name: 'klasifikasi', length: 100, nullable: true })
  klasifikasi: string | null;

  // Kepada
  @Column('varchar', { name: 'kepada_yth', length: 255, nullable: true })
  kepadaYth: string | null;

  // Isi Disposisi
  @Column('text', { name: 'disposisi', nullable: true })
  disposisi: string | null;

  // Catatan
  @Column('text', { name: 'catatan', nullable: true })
  catatan: string | null;

  // Paraf
  @Column('varchar', { name: 'paraf', length: 100, nullable: true })
  paraf: string | null;
}
