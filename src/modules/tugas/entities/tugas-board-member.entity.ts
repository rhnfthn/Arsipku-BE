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
import { TugasBoardMemberRole } from '../enums';
import { TugasBoardEntity } from './tugas-board.entity';
import { TugasTaskCommentEntity } from './tugas-task-comment.entity';
import { TugasTaskEntity } from './tugas-task.entity';

@Entity('tugas_board_member')
@Index('uq_tugas_board_member_position', ['boardId', 'positionId'], {
  unique: true,
})
@Index('idx_tugas_board_member_persnum', ['persnum'])
export class TugasBoardMemberEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'board_id', length: 36 })
  boardId: string;

  @Column('int')
  persnum: number;

  @Column('varchar', { name: 'position_id', length: 100 })
  positionId: string;

  @Column('varchar', { name: 'nama_snapshot', length: 150 })
  namaSnapshot: string;

  @Column('varchar', {
    name: 'position_text_snapshot',
    length: 255,
    nullable: true,
  })
  positionTextSnapshot: string | null;

  @Column('varchar', {
    length: 20,
    default: TugasBoardMemberRole.MEMBER,
  })
  role: TugasBoardMemberRole;

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

  @ManyToOne(() => TugasBoardEntity, (board) => board.members, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'board_id',
    foreignKeyConstraintName: 'fk_tugas_member_board',
  })
  board: TugasBoardEntity;

  @OneToMany(() => TugasTaskEntity, (task) => task.assigneeMember)
  assignedTasks: TugasTaskEntity[];

  @OneToMany(() => TugasTaskEntity, (task) => task.createdByMember)
  createdTasks: TugasTaskEntity[];

  @OneToMany(() => TugasTaskCommentEntity, (comment) => comment.member)
  comments: TugasTaskCommentEntity[];
}
