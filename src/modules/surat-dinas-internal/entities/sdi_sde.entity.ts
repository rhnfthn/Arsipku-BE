import { Column, Entity, PrimaryColumn, Index } from 'typeorm';

@Entity('sdi_sde')
export class SdiSdeEntity {
  @PrimaryColumn('char', { name: 'id', length: 36 })
  id: string;

  @Index('idx_sdi_sde_id_naskah')
  @Column('char', { name: 'id_naskah', nullable: true, length: 36 })
  idNaskah: string | null;

  // Kop naskah
  @Column('varchar', { name: 'kop_logo', nullable: true, length: 255 })
  kopLogo: string | null;

  @Column('varchar', { name: 'kop_nama', nullable: true, length: 150 })
  kopNama: string | null;

  @Column('text', { name: 'alamat_perusahaan', nullable: true })
  alamatPerusahaan: string | null;

  // Tempat & tanggal
  @Column('varchar', { name: 'nama_tempat', nullable: true, length: 150 })
  namaTempat: string | null;

  @Column('date', { name: 'tanggal', nullable: true })
  tanggal: Date | null;

  // Nomor surat
  @Column('varchar', { name: 'nomor', nullable: true, length: 100 })
  nomor: string | null;

  @Column('varchar', { name: 'sifat', nullable: true, length: 50 })
  sifat: string | null;

  @Column('varchar', { name: 'lampiran', nullable: true, length: 150 })
  lampiran: string | null;

  @Column('text', { name: 'perihal', nullable: true })
  perihal: string | null;

  // Penerima
  @Column('varchar', { name: 'kepada_yth', nullable: true, length: 255 })
  kepadaYth: string | null;

  @Column('varchar', { name: 'nama', nullable: true, length: 150 })
  nama: string | null;

  @Column('text', { name: 'alamat', nullable: true })
  alamat: string | null;

  // Konten
  @Column('text', { name: 'konten', nullable: true })
  konten: string | null;

  // Tanda tangan
  @Column('varchar', { name: 'nama_jabatan', nullable: true, length: 150 })
  namaJabatan: string | null;

  @Column('varchar', { name: 'tanda_tangan', nullable: true, length: 255 })
  tandaTangan: string | null;

  @Column('varchar', { name: 'nama_lengkap', nullable: true, length: 150 })
  namaLengkap: string | null;

  // Tembusan
  @Column('text', { name: 'tembusan', nullable: true })
  tembusan: string | null;
}
