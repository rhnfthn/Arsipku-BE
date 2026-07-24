import { Gender } from 'src/common/enums/gender.enum';
import {
  Column,
  Entity,
  UpdateDateColumn,
  Unique,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('pa_personal', { schema: 'navmail' })
@Unique('UQ_person', ['persnum'])
export class Person {
  @Column('char', { primary: true, name: 'id', length: 36 })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int', { name: 'persnum' })
  persnum: number | null;

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

  @Column('varchar', { name: 'name', length: 75 })
  name: string | null;

  @Column({
    type: 'enum',
    enum: Gender,
  })
  gender: Gender;

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
