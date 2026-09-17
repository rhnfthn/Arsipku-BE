import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreateTaskCommentDto, QueryTaskCommentDto } from '../dto';
import {
  TugasBoardEntity,
  TugasTaskCommentEntity,
} from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';

export interface TugasTaskCommentItem {
  id: string;
  taskId: string;
  memberId: string;
  isi: string;
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

/**
 * TugasCommentService
 *
 * Forum diskusi pada task: anggota papan dapat saling berdiskusi atau
 * memberikan informasi melalui komentar. Komentar terikat membership board
 * sehingga snapshot nama/jabatan konsisten dengan daftar anggota.
 *
 * Aturan akses:
 * - Semua anggota papan boleh membaca dan menulis komentar (diskusi terbuka).
 * - Hanya penulis komentar yang boleh menghapus komentarnya sendiri.
 * - Komentar tidak menaikkan revision papan (tidak mengubah task state),
 *   sehingga tidak memicu refetch Kanban di client lain.
 */
@Injectable()
export class TugasCommentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: TugasAccessReader,
    private readonly activity: TugasActivityService,
    private readonly tugasNotification: TugasNotificationService,
  ) {}

  /** GET /tugas/tasks/:taskId/comments — daftar komentar terbaru. */
  async list(taskId: string, query: QueryTaskCommentDto, actor: TugasActor) {
    const access = await this.access.assertTaskMember(
      taskId,
      actor.company,
      actor.position,
    );
    const repository = this.dataSource.getRepository(TugasTaskCommentEntity);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [comments, total] = await repository
      .createQueryBuilder('comment')
      .where('comment.task_id = :taskId', { taskId })
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const members = await this.access.repositories.member.find({
      where: { boardId: access.board.id },
    });

    return {
      data: comments.map((comment) =>
        this.mapComment(comment, members),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** POST /tugas/tasks/:taskId/comments — tambah komentar baru. */
  async add(taskId: string, dto: CreateTaskCommentDto, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      const comment = await manager
        .getRepository(TugasTaskCommentEntity)
        .save(
          manager.getRepository(TugasTaskCommentEntity).create({
            id: uuidv4(),
            taskId,
            memberId: access.member.id,
            isi: dto.isi,
            actorPersnum: actor.persnum,
            actorPositionId: actor.position,
          }),
        );
      await this.activity.record(manager, {
        boardId: access.board.id,
        taskId,
        aksi: TugasActivityAction.ADD_COMMENT,
        detail: {
          judul: access.task.judul,
          commentId: comment.id,
        },
        actor,
      });
      return { comment, boardId: access.board.id };
    });

    this.tugasNotification?.emitCommentAddedSafe({
      boardId: result.boardId,
      taskId,
      commentId: result.comment.id,
      actor,
    });

    const members = await this.access.repositories.member.find({
      where: { boardId: result.boardId },
    });

    return {
      status: 'success',
      message: 'Komentar berhasil ditambahkan',
      data: this.mapComment(result.comment, members),
    };
  }

  /** DELETE /tugas/tasks/:taskId/comments/:commentId — hapus komentar sendiri. */
  async remove(
    taskId: string,
    commentId: string,
    actor: TugasActor,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      const comment = await this.findComment(manager, taskId, commentId);
      if (comment.memberId !== access.member.id) {
        throw new ForbiddenException(
          'Komentar hanya dapat dihapus oleh penulisnya',
        );
      }
      await manager.getRepository(TugasTaskCommentEntity).remove(comment);
      await this.activity.record(manager, {
        boardId: access.board.id,
        taskId,
        aksi: TugasActivityAction.DELETE_COMMENT,
        detail: {
          judul: access.task.judul,
          commentId,
        },
        actor,
      });
      return { boardId: access.board.id };
    });

    this.tugasNotification?.emitCommentDeletedSafe({
      boardId: result.boardId,
      taskId,
      commentId,
      actor,
    });

    return {
      status: 'success',
      message: 'Komentar berhasil dihapus',
      data: null,
    };
  }

  private findComment(
    manager: EntityManager,
    taskId: string,
    commentId: string,
  ): Promise<TugasTaskCommentEntity> {
    return manager
      .getRepository(TugasTaskCommentEntity)
      .findOneOrFail({ where: { id: commentId, taskId } })
      .catch(() => {
        throw new NotFoundException('Komentar tidak ditemukan');
      });
  }

  private mapComment(
    comment: TugasTaskCommentEntity,
    members: { id: string; namaSnapshot: string; positionTextSnapshot: string | null }[],
  ): TugasTaskCommentItem {
    const member = members.find((candidate) => candidate.id === comment.memberId);
    return {
      id: comment.id,
      taskId: comment.taskId,
      memberId: comment.memberId,
      isi: comment.isi,
      actorPersnum: comment.actorPersnum,
      actorPositionId: comment.actorPositionId,
      actor: {
        persnum: comment.actorPersnum,
        positionId: comment.actorPositionId,
        nama: member?.namaSnapshot || `Pengguna ${comment.actorPersnum}`,
        positionText: member?.positionTextSnapshot ?? null,
      },
      createdAt: comment.createdAt,
    };
  }
}