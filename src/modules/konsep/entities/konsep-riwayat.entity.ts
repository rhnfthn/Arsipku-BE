import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('konsep_riwayat')
export class KonsepRiwayatEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'char', length: 36, name: 'id_naskah_konsep' })
  idNaskahKonsep: string;

  @Column({ type: 'int' })
  urutan: number;

  @Column({ type: 'int', name: 'from_position_id' })
  fromPositionId: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'from_position_text',
  })
  fromPositionText: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'from_nama' })
  fromNama: string | null;

  @Column({ type: 'int', nullable: true, name: 'to_position_id' })
  toPositionId: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'to_position_text',
  })
  toPositionText: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'to_nama' })
  toNama: string | null;

  @Column({
    type: 'enum',
    enum: [
      'create',
      'forward',
      'turunkan',
      'approve',
      'reject',
      'revisi',
      'finalize',
    ],
  })
  aksi:
    | 'create'
    | 'forward'
    | 'turunkan'
    | 'approve'
    | 'reject'
    | 'revisi'
    | 'finalize';

  @Column({ type: 'text', nullable: true })
  catatan: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'pdf_snapshot',
  })
  pdfSnapshot: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'created_by' })
  createdBy: string | null;
}
