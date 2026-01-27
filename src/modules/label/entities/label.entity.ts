import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('label')
export class LabelEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('varchar', { length: 36, name: 'position_id' })
  positionId: string;

  @Column('varchar', { length: 100 })
  nama: string;

  @Column('text', { nullable: true })
  deskripsi: string;

  @Column('varchar', { length: 36, nullable: true, name: 'id_parent' })
  idParent: string;

  @Column('varchar', { length: 7, default: '#808080' })
  warna: string;

  @Column('int', { default: 0 })
  urutan: number;

  @Column('tinyint', { default: 1, name: 'is_active' })
  isActive: boolean;

  @Column('varchar', { length: 36, name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => LabelEntity, (label) => label.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_parent' })
  parent: LabelEntity;

  @OneToMany(() => LabelEntity, (label) => label.parent)
  children: LabelEntity[];
}
