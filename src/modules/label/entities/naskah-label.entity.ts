import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LabelEntity } from './label.entity';

@Entity('naskah_label')
export class NaskahLabelEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // Denormalisasi naskah.tanggal — kunci partisi RANGE(YEAR(tanggal)), bagian PK komposit (id, tanggal)
  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('varchar', { length: 36, name: 'naskah_id' })
  naskahId: string;

  @Column('varchar', { length: 36, name: 'label_id' })
  labelId: string;

  @Column('enum', {
    name: 'source',
    enum: ['inbox', 'sent', 'draft'],
    default: 'inbox',
    comment: 'Sumber naskah: inbox=kotak masuk, sent=terkirim, draft=draft',
  })
  source: 'inbox' | 'sent' | 'draft';

  @Column('varchar', { length: 36, name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => LabelEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'label_id' })
  label: LabelEntity;
}
