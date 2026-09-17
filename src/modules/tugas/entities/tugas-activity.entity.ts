import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  ValueTransformer,
} from 'typeorm';
import { TugasActivityAction } from '../enums';
import { TugasBoardEntity } from './tugas-board.entity';
import { TugasTaskEntity } from './tugas-task.entity';

export const tugasJsonTransformer: ValueTransformer = {
  to: (value: Record<string, unknown> | null): string | null =>
    value == null ? null : JSON.stringify(value),
  from: (value: unknown): Record<string, unknown> | null => {
    if (value == null || value === '') return null;
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    if (typeof value !== 'string') return null;

    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  },
};

@Entity('tugas_activity')
@Index('idx_tugas_activity_board', ['boardId', 'createdAt'])
export class TugasActivityEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'board_id', length: 36 })
  boardId: string;

  @Column('char', { name: 'task_id', length: 36, nullable: true })
  taskId: string | null;

  @Column('varchar', { length: 50 })
  aksi: TugasActivityAction;

  @Column('text', { nullable: true, transformer: tugasJsonTransformer })
  detail: Record<string, unknown> | null;

  @Column('int', { name: 'actor_persnum' })
  actorPersnum: number;

  @Column('varchar', { name: 'actor_position_id', length: 100 })
  actorPositionId: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @ManyToOne(() => TugasBoardEntity, (board) => board.activities, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'board_id',
    foreignKeyConstraintName: 'fk_tugas_activity_board',
  })
  board: TugasBoardEntity;

  @ManyToOne(() => TugasTaskEntity, (task) => task.activities, {
    nullable: true,
    onUpdate: 'RESTRICT',
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'task_id',
    foreignKeyConstraintName: 'fk_tugas_activity_task',
  })
  task: TugasTaskEntity | null;
}
