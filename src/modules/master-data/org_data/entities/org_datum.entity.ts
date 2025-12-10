import {
  Column,
  Entity,
  UpdateDateColumn,
  Unique,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('organization_build', { schema: 'navmail' })
@Unique('UQ_person', ['tgl'])
export class OrgDatum {
  @Column('char', { primary: true, name: 'id', length: 36 })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('date', {
    name: 'tgl',
    nullable: true,
    default: () => "'2025-01-01'",
  })
  tgl: string | null;

  @Column({ type: 'json', nullable: true })
  organization_json: any | null;

  @Column({ type: 'json', nullable: true })
  position_json: any | null;

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
