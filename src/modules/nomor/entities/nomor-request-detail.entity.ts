import { Entity, Column, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { NomorRequestEntity } from './nomor-request.entity';

export type NomorRequestDetailStatus = 'booking' | 'terpakai' | 'tidak terpakai' | 'hangus';

@Entity('nomor_request_detail')
export class NomorRequestDetailEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'id_request', length: 36, nullable: true })
  idRequest: string | null;

  @Column('varchar', { length: 100, nullable: true })
  nomor: string | null;

  @Column('varchar', { name: 'file_name', length: 255, nullable: true })
  fileName: string | null;

  @Column('text', { name: 'file_text', nullable: true })
  fileText: string | null;

  @Column('enum', {
    enum: ['booking', 'terpakai', 'tidak terpakai', 'hangus'],
    default: 'booking',
  })
  status: NomorRequestDetailStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => NomorRequestEntity, (request) => request.details)
  @JoinColumn({ name: 'id_request' })
  request?: NomorRequestEntity;
}
