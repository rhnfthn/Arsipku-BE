import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('naskah_referensi')
export class NaskahReferensiEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  // Denormalisasi naskah.tanggal — kunci partisi RANGE(YEAR(tanggal)), bagian PK komposit (id, tanggal)
  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column({ type: 'char', length: 36, nullable: true })
  id_naskah: string | null;

  @Column({
    type: 'enum',
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA', 'K', 'UND', 'PER', 'KEP', 'INS', 'SPR', 'EDR', 'SOP', 'MOU', 'PKS', 'PROC', 'PJJ', 'LOA', 'SKU', 'BAC', 'KET', 'SPE', 'RPT', 'PEN', 'PGM', 'LAP'],
    nullable: true,
  })
  ref_jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K' | 'UND' | 'PER' | 'KEP' | 'INS' | 'SPR' | 'EDR' | 'SOP' | 'MOU' | 'PKS' | 'PROC' | 'PJJ' | 'LOA' | 'SKU' | 'BAC' | 'KET' | 'SPE' | 'RPT' | 'PEN' | 'PGM' | 'LAP' | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  ref_pengirim: string | null;

  @Column({ type: 'date', nullable: true })
  ref_tanggal: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ref_nomor: string | null;

  @Column({ type: 'text', nullable: true })
  ref_perihal: string | null;
}
