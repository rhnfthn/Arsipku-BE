import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TugasBoardMemberEntity } from './tugas-board-member.entity';
import { TugasTaskEntity } from './tugas-task.entity';

/**
 * Komentar forum pada task — dipakai untuk diskusi / berbagi informasi
 * antar anggota papan. Komentar terikat membership board (bukan persnum
 * bebas) agar snapshot nama/jabatan konsisten dengan anggota papan.
 */
@Entity('tugas_task_comment')
@Index('idx_tugas_comment_task', ['taskId', 'createdAt'])
export class TugasTaskCommentEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'task_id', length: 36 })
  taskId: string;

  @Column('char', { name: 'member_id', length: 36 })
  memberId: string;

  @Column('text')
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

  @ManyToOne(() => TugasTaskEntity, (task) => task.comments, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'task_id',
    foreignKeyConstraintName: 'fk_tugas_comment_task',
  })
  task: TugasTaskEntity;

  @ManyToOne(() => TugasBoardMemberEntity, (member) => member.comments, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'member_id',
    foreignKeyConstraintName: 'fk_tugas_comment_member',
  })
  member: TugasBoardMemberEntity;
}