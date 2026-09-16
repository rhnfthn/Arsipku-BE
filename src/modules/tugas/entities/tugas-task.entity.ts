import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TugasTaskPriority, TugasTaskStatus } from '../enums';
import { TugasActivityEntity } from './tugas-activity.entity';
import { TugasBoardMemberEntity } from './tugas-board-member.entity';
import { TugasBoardEntity } from './tugas-board.entity';
import { TugasTaskReferenceEntity } from './tugas-task-reference.entity';
import { TugasTaskEvidenceEntity } from './tugas-task-evidence.entity';

@Entity('tugas_task')
@Index('idx_tugas_task_board_status', [
  'boardId',
  'archivedAt',
  'status',
  'urutan',
])
@Index('idx_tugas_task_assignee', [
  'assigneeMemberId',
  'archivedAt',
  'status',
  'tenggat',
])
export class TugasTaskEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'board_id', length: 36 })
  boardId: string;

  @Column('varchar', { length: 255 })
  judul: string;

  @Column('text', { nullable: true })
  deskripsi: string | null;

  @Column('varchar', { length: 20, default: TugasTaskStatus.TODO })
  status: TugasTaskStatus;

  @Column('int', { default: 0 })
  urutan: number;

  @Column('varchar', { length: 20, nullable: true })
  prioritas: TugasTaskPriority | null;

  @Column('date', { nullable: true })
  tenggat: string | null;

  @Column('char', { name: 'assignee_member_id', length: 36, nullable: true })
  assigneeMemberId: string | null;

  @Column('timestamp', {
    name: 'selesai_at',
    precision: 0,
    nullable: true,
  })
  selesaiAt: Date | null;

  @Column('timestamp', {
    name: 'archived_at',
    precision: 0,
    nullable: true,
  })
  archivedAt: Date | null;

  @Column('timestamp', {
    name: 'reminder_h1_sent_at',
    precision: 0,
    nullable: true,
  })
  reminderH1SentAt: Date | null;

  @Column('char', {
    name: 'created_by_member_id',
    length: 36,
    nullable: true,
  })
  createdByMemberId: string | null;

  @Column('int', { name: 'created_by_persnum' })
  createdByPersnum: number;

  @Column('int', { name: 'updated_by_persnum', nullable: true })
  updatedByPersnum: number | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @ManyToOne(() => TugasBoardEntity, (board) => board.tasks, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'board_id',
    foreignKeyConstraintName: 'fk_tugas_task_board',
  })
  board: TugasBoardEntity;

  @ManyToOne(() => TugasBoardMemberEntity, (member) => member.assignedTasks, {
    nullable: true,
    onUpdate: 'RESTRICT',
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'assignee_member_id',
    foreignKeyConstraintName: 'fk_tugas_task_assignee',
  })
  assigneeMember: TugasBoardMemberEntity | null;

  @ManyToOne(() => TugasBoardMemberEntity, (member) => member.createdTasks, {
    nullable: true,
    onUpdate: 'RESTRICT',
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_tugas_task_creator_member',
  })
  createdByMember: TugasBoardMemberEntity | null;

  @OneToMany(() => TugasTaskReferenceEntity, (reference) => reference.task)
  references: TugasTaskReferenceEntity[];

  @OneToMany(() => TugasTaskEvidenceEntity, (evidence) => evidence.task)
  evidences: TugasTaskEvidenceEntity[];

  @OneToMany(() => TugasActivityEntity, (activity) => activity.task)
  activities: TugasActivityEntity[];
}
