import { Injectable } from '@nestjs/common';
import { QueryActivityDto } from '../dto';
import { TugasActivityEntity } from '../entities';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';

export interface TugasActivityItem {
  id: string;
  boardId: string;
  taskId: string | null;
  aksi: string;
  detail: Record<string, unknown> | null;
  actorPersnum: number;
  actorPositionId: string;
  createdAt: Date;
}

@Injectable()
export class TugasTimelineService {
  constructor(private readonly access: TugasAccessReader) {}

  /**
   * GET /tugas/boards/:boardId/activity
   *
   * Timeline papan: menggabungkan aksi, snapshot task (tersimpan pada
   * detail), dan waktu. Activity board tetap terbaca setelah task
   * dihapus karena FK task memakai ON DELETE SET NULL.
   */
  async findTimeline(
    boardId: string,
    query: QueryActivityDto,
    actor: TugasActor,
  ) {
    await this.access.assertBoardMember(boardId, actor.company, actor.position);
    const repository = this.access.repositories.activity;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [activities, total] = await repository
      .createQueryBuilder('activity')
      .where('activity.board_id = :boardId', { boardId })
      .orderBy('activity.createdAt', 'DESC')
      .addOrderBy('activity.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: activities.map((activity) => this.mapActivity(activity)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private mapActivity(activity: TugasActivityEntity): TugasActivityItem {
    return {
      id: activity.id,
      boardId: activity.boardId,
      taskId: activity.taskId,
      aksi: activity.aksi,
      detail: activity.detail,
      actorPersnum: activity.actorPersnum,
      actorPositionId: activity.actorPositionId,
      createdAt: activity.createdAt,
    };
  }
}
