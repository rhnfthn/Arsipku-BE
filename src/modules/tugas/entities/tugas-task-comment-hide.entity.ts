import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TugasTaskCommentEntity } from './tugas-task-comment.entity';

/**
 * "Hapus untuk saya" — komentar disembunyikan hanya untuk satu membership
 * board, tanpa menghapus baris komentar untuk anggota lain (pola WhatsApp).
 */
@Entity('tugas_task_comment_hide')
@Index('uq_tugas_comment_hide', ['commentId', 'memberId'], { unique: true })
export class TugasTaskCommentHideEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('char', { name: 'comment_id', length: 36 })
  commentId: string;

  @Column('char', { name: 'member_id', length: 36 })
  memberId: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @ManyToOne(() => TugasTaskCommentEntity, (comment) => comment.hides, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'comment_id',
    foreignKeyConstraintName: 'fk_tugas_comment_hide_comment',
  })
  comment: TugasTaskCommentEntity;
}