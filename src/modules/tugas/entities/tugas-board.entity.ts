import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TugasBoardType } from '../enums';
import { TugasActivityEntity } from './tugas-activity.entity';
import { TugasBoardMemberEntity } from './tugas-board-member.entity';
import { TugasTaskCommentEntity } from './tugas-task-comment.entity';
import { TugasTaskEntity } from './tugas-task.entity';

@Entity('tugas_board')
@Index('idx_tugas_board_company_deleted', ['company', 'deletedAt'])
@Index('idx_tugas_board_creator', ['createdByPersnum'])
export class TugasBoardEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('varchar', { length: 50 })
  company: string;

  @Column('varchar', { length: 150 })
  nama: string;

  @Column('text', { nullable: true })
  deskripsi: string | null;

  @Column('varchar', {
    length: 20,
    default: TugasBoardType.PERSONAL,
  })
  tipe: TugasBoardType;

  /** Nama ikon lucide (mis. 'rocket', 'briefcase') — null = default KanbanSquare. */
  @Column('varchar', { length: 50, nullable: true })
  icon: string | null;

  @Column('varchar', { length: 7, default: '#808080' })
  warna: string;

  @Column('int', { unsigned: true, default: 0 })
  revision: number;

  @Column('int', { name: 'created_by_persnum' })
  createdByPersnum: number;

  @Column('varchar', { name: 'created_by_position_id', length: 100 })
  createdByPositionId: string;

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

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamp',
    precision: 0,
    nullable: true,
  })
  deletedAt: Date | null;

  @OneToMany(() => TugasBoardMemberEntity, (member) => member.board)
  members: TugasBoardMemberEntity[];

  @OneToMany(() => TugasTaskEntity, (task) => task.board)
  tasks: TugasTaskEntity[];

  @OneToMany(() => TugasTaskCommentEntity, (comment) => comment.board)
  comments: TugasTaskCommentEntity[];

  @OneToMany(() => TugasActivityEntity, (activity) => activity.board)
  activities: TugasActivityEntity[];
}
