import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  TugasActivityEntity,
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
} from '../entities';
import { TugasBoardMemberRole, TugasTaskStatus } from '../enums';

export interface TugasBoardAccess {
  board: TugasBoardEntity;
  member: TugasBoardMemberEntity;
}

export interface TugasTaskAccess extends TugasBoardAccess {
  task: TugasTaskEntity;
}

@Injectable()
export class TugasAccessReader {
  constructor(
    @InjectRepository(TugasBoardEntity)
    private readonly boardRepository: Repository<TugasBoardEntity>,
    @InjectRepository(TugasBoardMemberEntity)
    private readonly memberRepository: Repository<TugasBoardMemberEntity>,
    @InjectRepository(TugasTaskEntity)
    private readonly taskRepository: Repository<TugasTaskEntity>,
    @InjectRepository(TugasActivityEntity)
    private readonly activityRepository: Repository<TugasActivityEntity>,
  ) {}

  async assertBoardMember(
    boardId: string,
    company: string,
    positionId: string,
    manager?: EntityManager,
  ): Promise<TugasBoardAccess> {
    const repository = manager
      ? manager.getRepository(TugasBoardMemberEntity)
      : this.memberRepository;
    const member = await repository
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.board', 'board')
      .where('member.board_id = :boardId', { boardId })
      .andWhere('member.position_id = :positionId', { positionId })
      .andWhere('board.company = :company', { company })
      .andWhere('board.deleted_at IS NULL')
      .getOne();

    if (!member) throw new NotFoundException('Papan tugas tidak ditemukan');
    return { board: member.board, member };
  }

  async assertBoardOwner(
    boardId: string,
    company: string,
    positionId: string,
    manager?: EntityManager,
  ): Promise<TugasBoardAccess> {
    const access = await this.assertBoardMember(
      boardId,
      company,
      positionId,
      manager,
    );
    if (access.member.role !== TugasBoardMemberRole.OWNER) {
      throw new ForbiddenException(
        'Hanya pemilik papan yang dapat melakukan aksi ini',
      );
    }
    return access;
  }

  async assertTaskMember(
    taskId: string,
    company: string,
    positionId: string,
    manager?: EntityManager,
  ): Promise<TugasTaskAccess> {
    const repository = manager
      ? manager.getRepository(TugasTaskEntity)
      : this.taskRepository;
    const task = await repository
      .createQueryBuilder('task')
      .innerJoinAndSelect('task.board', 'board')
      .innerJoinAndSelect(
        'board.members',
        'member',
        'member.position_id = :positionId',
        { positionId },
      )
      .leftJoinAndSelect('task.assigneeMember', 'assignee')
      .where('task.id = :taskId', { taskId })
      .andWhere('board.company = :company', { company })
      .andWhere('board.deleted_at IS NULL')
      .getOne();

    if (!task || !task.board.members[0]) {
      throw new NotFoundException('Task tidak ditemukan');
    }
    return { task, board: task.board, member: task.board.members[0] };
  }

  /**
   * Mutasi task hanya boleh dilakukan pembuatnya. Persnum dipakai sebagai
   * fallback untuk task lama ketika relasi membership pembuat sudah null.
   */
  assertTaskCreator(access: TugasTaskAccess): void {
    const isCreator = access.task.createdByMemberId
      ? access.task.createdByMemberId === access.member.id
      : access.task.createdByPersnum === access.member.persnum;

    if (!isCreator) {
      throw new ForbiddenException(
        'Task milik anggota lain hanya dapat dilihat',
      );
    }
  }

  /**
   * Detail dan progres task boleh diubah oleh pembuat atau PIC aktif.
   * Hak destruktif (hapus task) tetap memakai assertTaskCreator.
   */
  assertTaskEditor(access: TugasTaskAccess): void {
    const isCreator = access.task.createdByMemberId
      ? access.task.createdByMemberId === access.member.id
      : access.task.createdByPersnum === access.member.persnum;
    const isAssignee = access.task.assigneeMemberId === access.member.id;

    if (!isCreator && !isAssignee) {
      throw new ForbiddenException(
        'Task hanya dapat diubah oleh pembuat atau PIC yang ditugaskan',
      );
    }
  }

  async canAccessTask(
    taskId: string,
    company: string,
    positionId: string,
  ): Promise<boolean> {
    try {
      await this.assertTaskMember(taskId, company, positionId);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  countAssignedOpen(positionId: string, company: string): Promise<number> {
    return this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.board', 'board')
      .innerJoin('task.assigneeMember', 'assignee')
      .where('assignee.position_id = :positionId', { positionId })
      .andWhere('board.company = :company', { company })
      .andWhere('board.deleted_at IS NULL')
      .andWhere('task.archived_at IS NULL')
      .andWhere('task.status != :done', { done: TugasTaskStatus.DONE })
      .getCount();
  }

  /**
   * Count task aktif yang ditugaskan ke posisi, tanpa filter company eksplisit.
   * Aman: assignment (assignee_member_id) sudah terikat membership board,
   * dan board selalu satu company — jadi positionId unik per membership.
   * Dipakai RealtimeSummaryService yang tidak memegang context company.
   */
  countAssignedOpenByPosition(positionId: string): Promise<number> {
    return this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.board', 'board')
      .innerJoin('task.assigneeMember', 'assignee')
      .where('assignee.position_id = :positionId', { positionId })
      .andWhere('board.deleted_at IS NULL')
      .andWhere('task.archived_at IS NULL')
      .andWhere('task.status != :done', { done: TugasTaskStatus.DONE })
      .getCount();
  }

  get repositories() {
    return {
      board: this.boardRepository,
      member: this.memberRepository,
      task: this.taskRepository,
      activity: this.activityRepository,
    };
  }
}
