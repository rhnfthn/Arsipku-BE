import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { GrupPenerimaEntity } from './grup_penerima.entity';

@Entity('grup_penerima_detail')
export class GrupPenerimaDetailEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'char', length: 36 })
  id_grup_penerima: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  position: string;

  @ManyToOne(() => GrupPenerimaEntity, (grup) => grup.details, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_grup_penerima' })
  grupPenerima: GrupPenerimaEntity;
}
