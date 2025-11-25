import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

@Entity('label')
export class LabelEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  persnum: string;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  @Column({ type: 'text', nullable: true })
  deskripsi: string;

  @Column({ type: 'char', length: 36, nullable: true })
  id_parent: string;

  @Column({ type: 'boolean', default: true })
  aktif: boolean;

  // Self-referencing relationship untuk parent-child
  @ManyToOne(() => LabelEntity, (label) => label.childLabels, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_parent' })
  parentLabel: LabelEntity;

  @OneToMany(() => LabelEntity, (label) => label.parentLabel)
  childLabels: LabelEntity[];
}
