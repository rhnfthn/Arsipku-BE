import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TugasTaskCommentEntity } from './tugas-task-comment.entity';
import { TugasBoardMemberEntity } from './tugas-board-member.entity';

@Entity('tugas_comment_reaction')
@Index('uq_tugas_comment_reaction', ['commentId', 'memberId', 'emoji'], {
  unique: true,
})
export class TugasCommentReactionEntity {
  @PrimaryColumn('char', { length: 36 }) id: string;
  @Column('char', { name: 'comment_id', length: 36 }) commentId: string;
  @Column('char', { name: 'member_id', length: 36 }) memberId: string;
  @Column({
    type: 'varchar',
    length: 32,
    charset: 'utf8mb4',
    collation: 'utf8mb4_bin',
  })
  emoji: string;
  @ManyToOne(() => TugasTaskCommentEntity, (comment) => comment.reactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'comment_id' })
  comment: TugasTaskCommentEntity;
  @ManyToOne(() => TugasBoardMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: TugasBoardMemberEntity;
}
