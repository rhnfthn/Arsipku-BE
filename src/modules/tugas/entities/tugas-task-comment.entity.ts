import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { TugasBoardEntity } from './tugas-board.entity';
import { TugasBoardMemberEntity } from './tugas-board-member.entity';
import { TugasTaskCommentHideEntity } from './tugas-task-comment-hide.entity';
import { TugasCommentReactionEntity } from './tugas-comment-reaction.entity';
import { TugasTaskEntity } from './tugas-task.entity';
import { tugasCommentEncryptionTransformer } from '../helpers/tugas-comment-encryption';

/**
 * Komentar forum papan — diskusi umum seluruh anggota papan.
 * task_id OPSIONAL: dipakai saat user men-tag task tertentu sebagai
 * rujukan diskusi (bukan lagi wadah chat per task).
 */
@Entity('tugas_task_comment')
@Index('idx_tugas_comment_task', ['taskId', 'createdAt'])
@Index('idx_tugas_comment_board', ['boardId', 'createdAt'])
export class TugasTaskCommentEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'board_id', length: 36 })
  boardId: string;

  @Column('char', { name: 'task_id', length: 36, nullable: true })
  taskId: string | null;

  @Column('char', { name: 'member_id', length: 36 })
  memberId: string;

  @Column('text', { transformer: tugasCommentEncryptionTransformer })
  isi: string;

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

  @ManyToOne(() => TugasBoardEntity, (board) => board.comments, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'board_id',
    foreignKeyConstraintName: 'fk_tugas_comment_board',
  })
  board: TugasBoardEntity;

  @ManyToOne(() => TugasTaskEntity, (task) => task.comments, {
    nullable: true,
    onUpdate: 'RESTRICT',
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'task_id',
    foreignKeyConstraintName: 'fk_tugas_comment_task',
  })
  task: TugasTaskEntity | null;

  @ManyToOne(() => TugasBoardMemberEntity, (member) => member.comments, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'member_id',
    foreignKeyConstraintName: 'fk_tugas_comment_member',
  })
  member: TugasBoardMemberEntity;

  @OneToMany(() => TugasCommentReactionEntity, (reaction) => reaction.comment)
  reactions: TugasCommentReactionEntity[];

  @OneToMany(() => TugasTaskCommentHideEntity, (hide) => hide.comment)
  hides: TugasTaskCommentHideEntity[];
}
