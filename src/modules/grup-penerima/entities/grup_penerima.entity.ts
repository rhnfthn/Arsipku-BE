import { Entity, Column, PrimaryColumn, OneToMany, JoinColumn } from 'typeorm';
import { GrupPenerimaDetailEntity } from '../../grup-penerima-detail/entities/grup_penerima_detail.entity';

/** Jenis naskah dinas yang mengonsumsi grup penerima di form tulis. */
export const GRUP_PENERIMA_JENIS = [
  'ND',
  'SDI',
  'SDE',
  'DI',
  'KAJIAN',
] as const;
export type GrupPenerimaJenis = (typeof GRUP_PENERIMA_JENIS)[number];
export const GRUP_PENERIMA_TUJUAN = ['PENERIMA', 'TEMBUSAN'] as const;
export type GrupPenerimaTujuan = (typeof GRUP_PENERIMA_TUJUAN)[number];

@Entity('grup_penerima')
export class GrupPenerimaEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  @Column({ type: 'text', nullable: true })
  deskripsi: string;

  /**
   * Daftar jenis naskah (JSON array, mis. ["ND","SDI"]) di mana grup ini
   * ditampilkan. NULL = tampil di semua jenis naskah (backward compatible).
   */
  @Column({ type: 'json', nullable: true })
  jenis_naskah: string[] | null;

  /** NULL = dapat dipakai sebagai tertuju maupun tembusan. */
  @Column({ type: 'json', nullable: true })
  tujuan: GrupPenerimaTujuan[] | null;

  /** true = semua anggota grup; false = hanya anggota pada area pengirim. */
  @Column({ type: 'boolean', default: true })
  lintas_area: boolean;

  @Column({ type: 'boolean', default: true })
  aktif: boolean;

  @OneToMany(() => GrupPenerimaDetailEntity, (detail) => detail.grupPenerima, {
    cascade: true,
  })
  @JoinColumn({ name: 'id' })
  details: GrupPenerimaDetailEntity[];
}
