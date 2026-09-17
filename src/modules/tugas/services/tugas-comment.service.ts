import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreateTaskCommentDto, QueryTaskCommentDto } from '../dto';
import {
  TugasBoardEntity,
  TugasTaskCommentEntity,
  TugasTaskCommentHideEntity,
  TugasTaskEntity,
} from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';

/** Batas waktu komentar boleh dihapus untuk semua orang (ms). */
export const COMMENT_DELETE_WINDOW_MS = 5 * 60 * 1000;

export type TugasCommentDeleteScope = 'me' | 'everyone';

export interface TugasTaskCommentItem {
  id: string;
  boardId: string;
  taskId: string | null;
  /** Judul task saat komentar dibuat — null bila tidak men-tag task. */
  taskJudul: string | null;
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
 * Forum diskusi PAPAN: seluruh anggota papan saling berdiskusi atau
 * berbagi informasi dalam satu channel umum. Komentar dapat men-tag
 * task tertentu (taskId opsional) sebagai rujukan diskusi.
 *
 * Aturan akses:
 * - Semua anggota papan boleh membaca dan menulis komentar (diskusi terbuka).
 * - "Hapus untuk saya" (scope=me): sembunyikan komentar hanya untuk membership
 *   aktif — anggota lain tetap melihatnya. Bisa kapan saja.
 * - "Hapus untuk semua orang" (scope=everyone): hapus permanen, HANYA penulis
 *   komentar dan HANYA dalam 5 menit pertama setelah dikirim (pola WhatsApp).
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

  /**
   * GET /tugas/boards/:boardId/comments — daftar komentar forum papan.
   * Filter opsional taskId untuk melihat diskusi yang men-tag task tertentu.
   */
  async list(
    boardId: string,
    query: QueryTaskCommentDto,
    actor: TugasActor,
  ) {
    const access = await this.access.assertBoardMember(
      boardId,
      actor.company,
      actor.position,
    );
    const repository = this.dataSource.getRepository(TugasTaskCommentEntity);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    // ID komentar yang disembunyikan untuk membership aktif ("hapus untuk saya").
    const hidden = await this.dataSource
      .getRepository(TugasTaskCommentHideEntity)
      .find({ where: { memberId: access.member.id }, select: ['commentId'] });
    const hiddenIds = hidden.map((row) => row.commentId);

    const commentQuery = repository
      .createQueryBuilder('comment')
      .where('comment.board_id = :boardId', { boardId });
    if (query.taskId) {
      commentQuery.andWhere('comment.task_id = :taskId', {
        taskId: query.taskId,
      });
    }
    if (hiddenIds.length) {
      commentQuery.andWhere('comment.id NOT IN (:...hiddenIds)', { hiddenIds });
    }
    const [comments, total] = await commentQuery
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const [members, tasks] = await Promise.all([
      this.access.repositories.member.find({ where: { boardId } }),
      this.access.repositories.task.find({
        where: { boardId },
        select: ['id', 'judul'],
      }),
    ]);

    return {
      data: comments.map((comment) =>
        this.mapComment(comment, members, tasks),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * POST /tugas/boards/:boardId/comments — tambah komentar forum papan.
   * taskId opsional: bila diisi, komentar men-tag task tersebut.
   */
  async add(
    boardId: string,
    dto: CreateTaskCommentDto,
    actor: TugasActor,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertBoardMember(
        boardId,
        actor.company,
        actor.position,
        manager,
      );
      // Validasi tag task: harus task di papan yang sama.
      let taskJudul: string | null = null;
      if (dto.taskId) {
        const task = await manager.getRepository(TugasTaskEntity).findOne({
          where: { id: dto.taskId, boardId },
        });
        if (!task) {
          throw new NotFoundException('Task yang di-tag tidak ditemukan');
        }
        taskJudul = task.judul;
      }
      const comment = await manager
        .getRepository(TugasTaskCommentEntity)
        .save(
          manager.getRepository(TugasTaskCommentEntity).create({
            id: uuidv4(),
            boardId,
            taskId: dto.taskId ?? null,
            memberId: access.member.id,
            isi: dto.isi,
            actorPersnum: actor.persnum,
            actorPositionId: actor.position,
          }),
        );
      await this.activity.record(manager, {
        boardId,
        taskId: dto.taskId ?? null,
        aksi: TugasActivityAction.ADD_COMMENT,
        detail: {
          judul: taskJudul,
          commentId: comment.id,
        },
        actor,
      });
      return { comment, boardId, taskJudul };
    });

    this.tugasNotification?.emitCommentAddedSafe({
      boardId,
      taskId: dto.taskId ?? null,
      commentId: result.comment.id,
      actor,
    });

    const [members, tasks] = await Promise.all([
      this.access.repositories.member.find({ where: { boardId } }),
      this.access.repositories.task.find({
        where: { boardId },
        select: ['id', 'judul'],
      }),
    ]);

    return {
      status: 'success',
      message: 'Komentar berhasil ditambahkan',
      data: this.mapComment(result.comment, members, tasks),
    };
  }

  /**
   * DELETE /tugas/boards/:boardId/comments/:commentId?scope=me|everyone
   *
   * - scope=me: sembunyikan komentar hanya untuk membership aktif (kapan saja).
   * - scope=everyone: hapus permanen — hanya penulis, hanya dalam 5 menit
   *   pertama setelah komentar dikirim (pola WhatsApp).
   */
  async remove(
    boardId: string,
    commentId: string,
    scope: TugasCommentDeleteScope,
    actor: TugasActor,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertBoardMember(
        boardId,
        actor.company,
        actor.position,
        manager,
      );
      const comment = await this.findComment(manager, boardId, commentId);

      if (scope === 'me') {
        // "Hapus untuk saya": insert baris hide (idempoten via unique key).
        const hideRepository = manager.getRepository(TugasTaskCommentHideEntity);
        const existing = await hideRepository.findOne({
          where: { commentId, memberId: access.member.id },
        });
        if (!existing) {
          await hideRepository.save(
            hideRepository.create({
              id: uuidv4(),
              commentId,
              memberId: access.member.id,
            }),
          );
        }
        return { boardId: access.board.id, deletedForEveryone: false };
      }

      // scope=everyone: hanya penulis DAN dalam window 5 menit.
      if (comment.memberId !== access.member.id) {
        throw new ForbiddenException(
          'Komentar hanya dapat dihapus untuk semua orang oleh penulisnya',
        );
      }
      if (Date.now() - comment.createdAt.getTime() > COMMENT_DELETE_WINDOW_MS) {
        throw new BadRequestException(
          'Batas waktu hapus komentar untuk semua orang adalah 5 menit setelah dikirim',
        );
      }
      await manager.getRepository(TugasTaskCommentEntity).remove(comment);
      await this.activity.record(manager, {
        boardId,
        taskId: comment.taskId,
        aksi: TugasActivityAction.DELETE_COMMENT,
        detail: {
          judul: null,
          commentId,
        },
        actor,
      });
      return { boardId, deletedForEveryone: true };
    });

    if (result.deletedForEveryone) {
      this.tugasNotification?.emitCommentDeletedSafe({
        boardId,
        taskId: null,
        commentId,
        actor,
      });
    }

    return {
      status: 'success',
      message: result.deletedForEveryone
        ? 'Komentar berhasil dihapus untuk semua orang'
        : 'Komentar berhasil dihapus untuk Anda',
      data: null,
    };
  }

  private findComment(
    manager: EntityManager,
    boardId: string,
    commentId: string,
  ): Promise<TugasTaskCommentEntity> {
    return manager
      .getRepository(TugasTaskCommentEntity)
      .findOneOrFail({ where: { id: commentId, boardId } })
      .catch(() => {
        throw new NotFoundException('Komentar tidak ditemukan');
      });
  }

  private mapComment(
    comment: TugasTaskCommentEntity,
    members: { id: string; namaSnapshot: string; positionTextSnapshot: string | null }[],
    tasks: { id: string; judul: string }[],
  ): TugasTaskCommentItem {
    const member = members.find((candidate) => candidate.id === comment.memberId);
    const task = comment.taskId
      ? tasks.find((candidate) => candidate.id === comment.taskId)
      : undefined;
    return {
      id: comment.id,
      boardId: comment.boardId,
      taskId: comment.taskId,
      taskJudul: task?.judul ?? null,
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