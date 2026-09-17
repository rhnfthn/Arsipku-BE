import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TugasReferenceType } from '../enums';
import { TugasTaskEntity } from './tugas-task.entity';

@Entity('tugas_task_reference')
@Index('uq_tugas_task_reference', ['taskId', 'referenceType', 'referenceId'], {
  unique: true,
})
export class TugasTaskReferenceEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'task_id', length: 36 })
  taskId: string;

  @Column('varchar', { name: 'reference_type', length: 30 })
  referenceType: TugasReferenceType;

  @Column('char', { name: 'reference_id', length: 36 })
  referenceId: string;

  @Column('varchar', { name: 'label_snapshot', length: 255 })
  labelSnapshot: string;

  @Column('varchar', { length: 500 })
  route: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @ManyToOne(() => TugasTaskEntity, (task) => task.references, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'task_id',
    foreignKeyConstraintName: 'fk_tugas_reference_task',
  })
  task: TugasTaskEntity;
}
