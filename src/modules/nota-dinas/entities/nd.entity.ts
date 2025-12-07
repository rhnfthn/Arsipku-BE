import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('nd', { schema: 'navmail' })
export class NdEntity {
  @PrimaryColumn('char', { name: 'id', length: 36 })
  id: string;

  @Column('char', { name: 'id_naskah', length: 36, nullable: true })
  @Index('idx_nd_id_naskah')
  idNaskah: string | null;

  // Kop Naskah
  @Column('varchar', { name: 'kop_logo', length: 255, nullable: true })
  kopLogo: string | null;

  @Column('varchar', { name: 'kop_nama', length: 150, nullable: true })
  kopNama: string | null;

  @Column('text', { name: 'alamat_perusahaan', nullable: true })
  alamatPerusahaan: string | null;

  // Header
  @Column('varchar', { name: 'nomor', length: 100, nullable: true })
  nomor: string | null;

  @Column('varchar', { name: 'kepada_yth', length: 255, nullable: true })
  kepadaYth: string | null;

  @Column('varchar', { name: 'dari', length: 150, nullable: true })
  dari: string | null;

  @Column('text', { name: 'perihal', nullable: true })
  perihal: string | null;

  // Batang Tubuh
  @Column('text', { name: 'konten', nullable: true })
  konten: string | null;

  // Kaki
  @Column('varchar', { name: 'nama_tempat', length: 150, nullable: true })
  namaTempat: string | null;

  @Column('date', { name: 'tanggal', nullable: true })
  tanggal: Date | null;

  @Column('varchar', { name: 'nama_jabatan', length: 150, nullable: true })
  namaJabatan: string | null;

  @Column('varchar', { name: 'tanda_tangan', length: 255, nullable: true })
  tandaTangan: string | null;

  @Column('varchar', { name: 'nama_lengkap', length: 150, nullable: true })
  namaLengkap: string | null;

  @Column('text', { name: 'tembusan', nullable: true })
  tembusan: string | null;
}
