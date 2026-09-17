import { Injectable } from '@nestjs/common';
import { QueryActivityDto } from '../dto';
import { TugasActivityEntity, TugasBoardMemberEntity } from '../entities';
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
  actor: {
    persnum: number;
    positionId: string;
    nama: string;
    positionText: string | null;
  };
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
    const activityQuery = repository
      .createQueryBuilder('activity')
      .where('activity.board_id = :boardId', { boardId })
      .orderBy('activity.createdAt', 'DESC')
      .addOrderBy('activity.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [[activities, total], members] = await Promise.all([
      activityQuery.getManyAndCount(),
      this.access.repositories.member.find({ where: { boardId } }),
    ]);

    return {
      data: activities.map((activity) => this.mapActivity(activity, members)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private mapActivity(
    activity: TugasActivityEntity,
    members: TugasBoardMemberEntity[],
  ): TugasActivityItem {
    const detailActor = this.readActorSnapshot(activity.detail?.actor);
    const member = members.find(
      (candidate) =>
        candidate.positionId === activity.actorPositionId ||
        candidate.persnum === activity.actorPersnum,
    );
    const actor = {
      persnum: activity.actorPersnum,
      positionId: activity.actorPositionId,
      nama:
        detailActor?.nama ||
        member?.namaSnapshot ||
        `Pengguna ${activity.actorPersnum}`,
      positionText:
        detailActor?.positionText ?? member?.positionTextSnapshot ?? null,
    };

    return {
      id: activity.id,
      boardId: activity.boardId,
      taskId: activity.taskId,
      aksi: activity.aksi,
      detail: activity.detail,
      actorPersnum: activity.actorPersnum,
      actorPositionId: activity.actorPositionId,
      actor,
      createdAt: activity.createdAt,
    };
  }

  private readActorSnapshot(value: unknown): {
    nama: string;
    positionText: string | null;
  } | null {
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as Record<string, unknown>;
    const nama = typeof snapshot.nama === 'string' ? snapshot.nama.trim() : '';
    if (!nama) return null;
    return {
      nama,
      positionText:
        typeof snapshot.positionText === 'string'
          ? snapshot.positionText
          : null,
    };
  }
}
