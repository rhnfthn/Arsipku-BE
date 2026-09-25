import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AddTaskReferenceDto } from '../dto';
import { TugasActivityAction, TugasReferenceType } from '../enums';
import {
  TugasBoardEntity,
  TugasTaskEntity,
  TugasTaskReferenceEntity,
} from '../entities';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';
import { TugasReferenceResolver } from './tugas-reference-resolver.service';

export interface TugasTaskReferenceItem {
  id: string;
  referenceType: TugasReferenceType;
  referenceId: string;
  labelSnapshot: string;
  route: string;
  available: boolean;
  createdAt: Date;
}

@Injectable()
export class TugasReferenceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: TugasAccessReader,
    private readonly activity: TugasActivityService,
    private readonly resolver: TugasReferenceResolver,
    private readonly tugasNotification: TugasNotificationService,
  ) {}

  /**
   * POST /tugas/tasks/:taskId/references
   *
   * Reference di-resolve server-side (label + route); client tidak bisa
   * menyuntikkan route sendiri. Duplicate (task, type, id) ditolak.
   */
  async add(taskId: string, dto: AddTaskReferenceDto, actor: TugasActor) {
    const hasReferenceId = Boolean(dto.referenceId);
    const hasReferenceNumber = Boolean(dto.referenceNumber);
    if (hasReferenceId === hasReferenceNumber) {
      throw new BadRequestException(
        'Isi salah satu ID atau nomor naskah referensi',
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskEditor(access);
      const board = await this.lockBoard(manager, access.board.id);
      const task = await manager.getRepository(TugasTaskEntity).findOneOrFail({
        where: { id: taskId },
      });

      // Resolve SEBELUM mutasi agar error tidak meninggalkan board revision
      // yang naik tanpa perubahan nyata.
      const resolved = dto.referenceId
        ? await this.resolver.resolve(dto.referenceType, dto.referenceId, actor)
        : await this.resolver.resolveByNumber(
            dto.referenceType,
            dto.referenceNumber!,
            actor,
          );

      const repository = manager.getRepository(TugasTaskReferenceEntity);
      const duplicate = await repository.findOne({
        where: {
          taskId,
          referenceType: resolved.referenceType,
          referenceId: resolved.referenceId,
        },
      });
      if (duplicate) {
        throw new BadRequestException(
          'Referensi tersebut sudah terhubung ke task ini',
        );
      }

      const reference = await repository.save(
        repository.create({
          id: uuidv4(),
          taskId,
          referenceType: resolved.referenceType,
          referenceId: resolved.referenceId,
          labelSnapshot: resolved.labelSnapshot,
          route: resolved.route,
        }),
      );

      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: TugasActivityAction.ADD_REFERENCE,
        detail: {
          judul: task.judul,
          referenceType: resolved.referenceType,
          referenceId: resolved.referenceId,
          label: resolved.labelSnapshot,
        },
        actor,
      });
      return {
        reference,
        boardId: board.id,
        revision: board.revision,
      };
    });

    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.boardId,
      revision: result.revision,
      action: 'add_reference',
      taskId,
      actor,
    });

    return {
      status: 'success',
      message: 'Referensi berhasil ditambahkan',
      data: {
        ...this.mapReference(result.reference),
        available: true,
        revision: result.revision,
      },
    };
  }

  /**
   * DELETE /tugas/tasks/:taskId/references/:referenceId
   *
   * Penghapusan reference tidak menghapus dokumen sumber.
   */
  async remove(taskId: string, referenceId: string, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskEditor(access);
      const board = await this.lockBoard(manager, access.board.id);
      const task = await manager.getRepository(TugasTaskEntity).findOneOrFail({
        where: { id: taskId },
      });
      const repository = manager.getRepository(TugasTaskReferenceEntity);
      const reference = await repository.findOne({
        where: { id: referenceId, taskId },
      });
      if (!reference) {
        throw new NotFoundException('Referensi tidak ditemukan');
      }

      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: TugasActivityAction.REMOVE_REFERENCE,
        detail: {
          judul: task.judul,
          referenceType: reference.referenceType,
          referenceId: reference.referenceId,
          label: reference.labelSnapshot,
        },
        actor,
      });
      await repository.remove(reference);
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      return {
        removed: reference,
        boardId: board.id,
        revision: board.revision,
      };
    });

    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.boardId,
      revision: result.revision,
      action: 'remove_reference',
      taskId,
      actor,
    });

    return {
      status: 'success',
      message: 'Referensi berhasil dihapus',
      data: { id: referenceId, revision: result.revision },
    };
  }

  /** Daftar reference milik task (dipakai modal detail task). */
  async listByTask(taskId: string, actor: TugasActor) {
    await this.access.assertTaskMember(taskId, actor.company, actor.position);
    const references = await this.access.repositories.task.manager
      .getRepository(TugasTaskReferenceEntity)
      .find({
        where: { taskId },
        order: { createdAt: 'ASC' },
      });
    return Promise.all(
      references.map(async (reference) => ({
        ...this.mapReference(reference),
        available: await this.resolver.canOpen(
          reference.referenceType,
          reference.referenceId,
          actor,
        ),
      })),
    );
  }

  /**
   * Resolve reference awal untuk create task dengan referensi
   * (dipakai TugasTaskService.create via quick create).
   */
  resolveForCreate(
    manager: EntityManager,
    referenceType: TugasReferenceType,
    referenceId: string,
    actor: TugasActor,
  ) {
    void manager; // resolver tidak butuh manager — query read-only.
    return this.resolver.resolve(referenceType, referenceId, actor);
  }

  private mapReference = (
    reference: TugasTaskReferenceEntity,
  ): Omit<TugasTaskReferenceItem, 'available'> => ({
    id: reference.id,
    referenceType: reference.referenceType,
    referenceId: reference.referenceId,
    labelSnapshot: reference.labelSnapshot,
    route: reference.route,
    createdAt: reference.createdAt,
  });

  private lockBoard(manager: EntityManager, boardId: string) {
    return manager.getRepository(TugasBoardEntity).findOneOrFail({
      where: { id: boardId },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
