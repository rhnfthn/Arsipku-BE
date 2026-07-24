import {
  Column,
  Entity,
  UpdateDateColumn,
  Unique,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('om_relation_sp', { schema: 'navmail' })
@Unique('UQ_sp', ['startDate', 'position', 'relation_persnum', 'company'])
export class RelationSp {
  @Column('char', { primary: true, name: 'id', length: 36 })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int', { name: 'company', nullable: true })
  company: number | null;

  @Column('date', {
    name: 'start_date',
    nullable: true,
    default: () => "'2025-01-01'",
  })
  startDate: string | null;

  @Column('date', {
    name: 'end_date',
    nullable: true,
    default: () => "'9999-12-31'",
  })
  endDate: string | null;

  @Column('int', { name: 'position', nullable: true })
  position: number | null;

  @Column('varchar', { name: 'position_text', nullable: true, length: 200 })
  position_text: string | null;

  @Column('int', { name: 'relation_persnum', nullable: true })
  relation_persnum: number | null;

  @Column('varchar', {
    name: 'relation_persnum_text',
    nullable: true,
    length: 200,
  })
  relation_persnum_text: string | null;

  @Column('datetime', {
    name: 'create_at',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createAt: Date | null;

  @UpdateDateColumn({ name: 'update_at', type: 'datetime' })
  updateAt: Date | null;

  @Column('varchar', { name: 'uname', nullable: true, length: 11 })
  uname: string | null;
}
