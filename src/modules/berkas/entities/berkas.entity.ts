import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HitungWaktuRetensiDari {
  SEJAK_BERKAS_DIBUAT = 'Sejak Berkas Dibuat',
  SEJAK_BERKAS_DITUTUP = 'Sejak Berkas Ditutup',
}

export enum TindakanPenyusutanAkhir {
  MUSNAH = 'Musnah',
  DINILAI_KEMBALI = 'Dinilai Kembali',
  PERMANEN = 'Permanen',
}

@Entity('berkas', { schema: 'navmail' })
export class Berkas {
  @PrimaryGeneratedColumn('uuid')
  @Column('char', { primary: true, name: 'id', length: 36 })
  id: string;

  @Column('varchar', { name: 'klasifikasi', length: 50 })
  klasifikasi: string;

  @Column('varchar', { name: 'judul_berkas', length: 200 })
  judulBerkas: string;

  @Column({
    type: 'enum',
    name: 'hitung_waktu_retensi_dari',
    enum: HitungWaktuRetensiDari,
  })
  hitungWaktuRetensiDari: HitungWaktuRetensiDari;

  @Column({
    type: 'enum',
    name: 'tindakan_penyusutan_akhir',
    enum: TindakanPenyusutanAkhir,
  })
  tindakanPenyusutanAkhir: TindakanPenyusutanAkhir;

  @Column('varchar', { name: 'lokasi', length: 255 })
  lokasi: string;

  @Column('text', { name: 'isi_ringkas' })
  isiRingkas: string;

  @Column('boolean', { name: 'is_aktif', default: true })
  isAktif: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
