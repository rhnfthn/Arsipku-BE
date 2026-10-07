import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateTaskDto,
  MoveTaskDto,
  QueryMyTaskDto,
  QueryTaskDto,
  UpdateTaskDto,
} from '../dto';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEvidenceEntity,
  TugasTaskEntity,
  TugasTaskReferenceEntity,
} from '../entities';
import {
  TugasActivityAction,
  TugasReferenceType,
  TugasMyTaskScope,
  TugasTaskPriority,
  TugasTaskStatus,
} from '../enums';
import { mapTask } from '../tugas-response.mapper';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';
import { TugasReferenceResolver } from './tugas-reference-resolver.service';
import { StorageService } from '../../storage/services/storage.service';

export interface MyTaskCounts {
  terlambat: number;
  hariIni: number;
  mendatang: number;
  selesai: number;
}

@Injectable()
export class TugasTaskService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: TugasAccessReader,
    private readonly activity: TugasActivityService,
    private readonly tugasNotification: TugasNotificationService,
    private readonly referenceResolver: TugasReferenceResolver,
    private readonly storage: StorageService,
  ) {}

  async create(boardId: string, dto: CreateTaskDto, actor: TugasActor) {
    if (Boolean(dto.referenceType) !== Boolean(dto.referenceId)) {
      throw new BadRequestException(
        'referenceType dan referenceId harus dikirim bersamaan',
      );
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const { board, member } = await this.access.assertBoardMember(
        boardId,
        actor.company,
        actor.position,
        manager,
      );
      if (
        dto.referenceType &&
        ![
          TugasReferenceType.NASKAH_MASUK,
          TugasReferenceType.NASKAH_TERKIRIM,
          TugasReferenceType.DISPOSISI,
        ].includes(dto.referenceType)
      ) {
        throw new BadRequestException(
          'Referensi naskah harus berasal dari Kotak Masuk atau Terkirim',
        );
      }
      await this.lockBoard(manager, board.id);
      const repository = manager.getRepository(TugasTaskEntity);
      const maximum = await repository
        .createQueryBuilder('task')
        .select('MAX(task.urutan)', 'maximum')
        .where('task.board_id = :boardId', { boardId })
        .andWhere('task.status = :status', { status: TugasTaskStatus.TODO })
        .andWhere('task.archived_at IS NULL')
        .getRawOne<{ maximum: string | null }>();
      const assigneeMember = dto.assigneeMemberId
        ? await this.resolveAssigneeMember(
            manager,
            boardId,
            dto.assigneeMemberId,
          )
        : member;
      // Reference awal (quick create): resolve server-side di dalam transaction
      // agar payload route/label dari client tidak pernah dipercaya.
      const initialReference =
        dto.referenceType && dto.referenceId
          ? await this.referenceResolver.resolve(
              dto.referenceType,
              dto.referenceId,
              actor,
            )
          : null;
      const task = await repository.save(
        repository.create({
          id: uuidv4(),
          boardId,
          judul: dto.judul,
          deskripsi: dto.deskripsi || null,
          status: TugasTaskStatus.TODO,
          urutan: Number(maximum?.maximum ?? -1) + 1,
          prioritas: dto.prioritas ?? null,
          tenggat: dto.tenggat ?? null,
          assigneeMemberId: assigneeMember.id,
          createdByMemberId: member.id,
          createdByPersnum: actor.persnum,
          updatedByPersnum: actor.persnum,
        }),
      );
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      await this.activity.record(manager, {
        boardId,
        taskId: task.id,
        aksi: TugasActivityAction.CREATE_TASK,
        detail: { judul: task.judul, status: task.status },
        actor,
      });
      if (dto.assigneeMemberId && assigneeMember.id !== member.id) {
        await this.activity.record(manager, {
          boardId,
          taskId: task.id,
          aksi: TugasActivityAction.ASSIGN_TASK,
          detail: {
            judul: task.judul,
            to: {
              memberId: assigneeMember.id,
              nama: assigneeMember.namaSnapshot,
              positionId: assigneeMember.positionId,
            },
          },
          actor,
        });
      }
      if (initialReference) {
        const referenceRepository = manager.getRepository(
          TugasTaskReferenceEntity,
        );
        await referenceRepository.save(
          referenceRepository.create({
            id: uuidv4(),
            taskId: task.id,
            referenceType: initialReference.referenceType,
            referenceId: initialReference.referenceId,
            labelSnapshot: initialReference.labelSnapshot,
            route: initialReference.route,
          }),
        );
        await this.activity.record(manager, {
          boardId,
          taskId: task.id,
          aksi: TugasActivityAction.ADD_REFERENCE,
          detail: {
            judul: task.judul,
            referenceType: initialReference.referenceType,
            referenceId: initialReference.referenceId,
            label: initialReference.labelSnapshot,
          },
          actor,
        });
      }
      task.assigneeMember = assigneeMember;
      return {
        task,
        board,
        assigneeMember,
        revision: board.revision,
      };
    });
    // Emit + notifikasi SETELAH commit (rollback tidak boleh mengirim event).
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.board.id,
      revision: result.revision,
      action: 'create_task',
      taskId: result.task.id,
      actor,
    });
    if (result.assigneeMember.positionId !== actor.position) {
      this.tugasNotification
        ?.notifyAssigned({
          board: result.board,
          task: result.task,
          assigneePositionId: result.assigneeMember.positionId,
          assigneePersnum: result.assigneeMember.persnum,
          actor,
        })
        .catch(() => undefined);
    }
    this.refreshAssignedCounts([result.assigneeMember], actor.company);
    return {
      status: 'success',
      message: 'Task berhasil dibuat',
      data: { ...mapTask(result.task), revision: result.revision },
    };
  }

  async findAll(boardId: string, query: QueryTaskDto, actor: TugasActor) {
    await this.access.assertBoardMember(boardId, actor.company, actor.position);
    const qb = this.access.repositories.task
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assigneeMember', 'assignee')
      .where('task.board_id = :boardId', { boardId });
    if (!query.includeArchived) qb.andWhere('task.archived_at IS NULL');
    if (query.status)
      qb.andWhere('task.status = :status', { status: query.status });
    if (query.prioritas) {
      qb.andWhere('task.prioritas = :prioritas', {
        prioritas: query.prioritas,
      });
    }
    if (query.q) {
      qb.andWhere('(task.judul LIKE :search OR task.deskripsi LIKE :search)', {
        search: `%${query.q}%`,
      });
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [tasks, total] = await qb
      .orderBy('task.status', 'ASC')
      .addOrderBy('task.urutan', 'ASC')
      .addOrderBy('task.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data: tasks.map(mapTask),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(taskId: string, actor: TugasActor) {
    const { task, board } = await this.access.assertTaskMember(
      taskId,
      actor.company,
      actor.position,
    );
    return {
      status: 'success',
      message: 'Detail task berhasil diambil',
      data: { ...mapTask(task), revision: board.revision },
    };
  }

  async update(taskId: string, dto: UpdateTaskDto, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskEditor(access);
      const board = await this.lockBoard(manager, access.board.id);
      const task = await this.lockTask(manager, taskId);
      const before = this.taskDetailSnapshot(task);
      if (dto.judul !== undefined) task.judul = dto.judul;
      if (dto.deskripsi !== undefined) task.deskripsi = dto.deskripsi || null;
      if (dto.prioritas !== undefined) task.prioritas = dto.prioritas || null;
      if (dto.tenggat !== undefined) {
        task.tenggat = dto.tenggat || null;
        task.reminderH1SentAt = null;
      }
      let assigneeActivity: {
        aksi: TugasActivityAction;
        detail: Record<string, unknown>;
      } | null = null;
      let previousAssignee: TugasBoardMemberEntity | null = null;
      if (dto.assigneeMemberId !== undefined) {
        previousAssignee = task.assigneeMember;
        const nextAssignee = dto.assigneeMemberId
          ? await this.resolveAssigneeMember(
              manager,
              task.boardId,
              dto.assigneeMemberId,
            )
          : null;
        const changed =
          (previousAssignee?.id ?? null) !== (nextAssignee?.id ?? null);
        if (changed) {
          task.assigneeMemberId = nextAssignee?.id ?? null;
          task.assigneeMember = nextAssignee;
          assigneeActivity = {
            aksi: nextAssignee
              ? TugasActivityAction.ASSIGN_TASK
              : TugasActivityAction.UNASSIGN_TASK,
            detail: {
              judul: task.judul,
              from: previousAssignee
                ? {
                    memberId: previousAssignee.id,
                    nama: previousAssignee.namaSnapshot,
                    positionId: previousAssignee.positionId,
                  }
                : null,
              to: nextAssignee
                ? {
                    memberId: nextAssignee.id,
                    nama: nextAssignee.namaSnapshot,
                    positionId: nextAssignee.positionId,
                  }
                : null,
            },
          };
        }
      }
      task.updatedByPersnum = actor.persnum;
      const saved = await manager.getRepository(TugasTaskEntity).save(task);
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: TugasActivityAction.UPDATE_TASK,
        detail: {
          judul: saved.judul,
          before,
          after: this.taskDetailSnapshot(saved),
        },
        actor,
      });
      if (assigneeActivity) {
        await this.activity.record(manager, {
          boardId: board.id,
          taskId,
          aksi: assigneeActivity.aksi,
          detail: assigneeActivity.detail,
          actor,
        });
      }
      // Assignee response mengikuti hasil perubahan assignment; fallback ke
      // nilai awal hanya ketika assignment tidak ikut di-update.
      saved.assigneeMember =
        dto.assigneeMemberId !== undefined
          ? task.assigneeMember
          : access.task.assigneeMember;
      return {
        task: saved,
        board,
        nextAssignee:
          dto.assigneeMemberId !== undefined ? task.assigneeMember : null,
        previousAssignee,
        assigneeChanged: Boolean(assigneeActivity),
        revision: board.revision,
      };
    });
    // Emit + notifikasi SETELAH commit.
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.board.id,
      revision: result.revision,
      action: 'update_task',
      taskId,
      actor,
    });
    if (
      result.assigneeChanged &&
      result.nextAssignee &&
      result.nextAssignee.positionId !== actor.position
    ) {
      this.tugasNotification
        ?.notifyAssigned({
          board: result.board,
          task: result.task,
          assigneePositionId: result.nextAssignee.positionId,
          assigneePersnum: result.nextAssignee.persnum,
          actor,
        })
        .catch(() => undefined);
    }
    if (result.assigneeChanged) {
      this.refreshAssignedCounts(
        [result.previousAssignee, result.nextAssignee],
        actor.company,
      );
    }
    return {
      status: 'success',
      message: 'Task berhasil diperbarui',
      data: { ...mapTask(result.task), revision: result.revision },
    };
  }

  async move(taskId: string, dto: MoveTaskDto, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskEditor(access);
      const board = await this.lockBoard(manager, access.board.id);
      if (board.revision !== dto.expectedRevision) {
        throw new ConflictException({
          statusCode: 409,
          code: 'TUGAS_REVISION_CONFLICT',
          message: 'Papan telah berubah. Muat ulang data terbaru.',
          currentRevision: board.revision,
        });
      }
      const task = await this.lockTask(manager, taskId);
      if (task.archivedAt) {
        throw new BadRequestException(
          'Task yang diarsipkan tidak dapat dipindahkan',
        );
      }
      const from = task.status;
      const source = await this.lockStatusTasks(
        manager,
        board.id,
        from,
        taskId,
      );
      const target =
        from === dto.status
          ? source
          : await this.lockStatusTasks(manager, board.id, dto.status, taskId);
      const targetIndex = Math.min(dto.urutan, target.length);
      task.status = dto.status;
      task.selesaiAt =
        dto.status === TugasTaskStatus.DONE
          ? (task.selesaiAt ?? new Date())
          : null;
      task.updatedByPersnum = actor.persnum;
      target.splice(targetIndex, 0, task);
      this.normalize(source);
      if (target !== source) this.normalize(target);
      await manager
        .getRepository(TugasTaskEntity)
        .save(target === source ? source : [...source, ...target]);
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: TugasActivityAction.MOVE_TASK,
        detail: {
          judul: task.judul,
          from,
          to: dto.status,
          urutan: task.urutan,
        },
        actor,
      });
      task.assigneeMember = access.task.assigneeMember;
      return {
        task,
        board,
        from,
        assignee: task.assigneeMember,
        revision: board.revision,
      };
    });
    // Emit + notifikasi SETELAH commit.
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.board.id,
      revision: result.revision,
      action: 'move_task',
      taskId,
      actor,
    });
    if (dto.status === TugasTaskStatus.DONE && result.assignee) {
      if (result.assignee.positionId !== actor.position) {
        this.tugasNotification
          ?.notifyDone({
            board: result.board,
            task: result.task,
            assigneePositionId: result.assignee.positionId,
            assigneePersnum: result.assignee.persnum,
            actor,
          })
          .catch(() => undefined);
      }
    }
    if (
      result.assignee &&
      (result.from === TugasTaskStatus.DONE) !==
        (dto.status === TugasTaskStatus.DONE)
    ) {
      this.refreshAssignedCounts([result.assignee], actor.company);
    }
    return {
      status: 'success',
      message: 'Task berhasil dipindahkan',
      data: { ...mapTask(result.task), revision: result.revision },
    };
  }

  archive(taskId: string, actor: TugasActor) {
    return this.setArchiveState(taskId, true, actor);
  }

  unarchive(taskId: string, actor: TugasActor) {
    return this.setArchiveState(taskId, false, actor);
  }

  async remove(taskId: string, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskCreator(access);
      const board = await this.lockBoard(manager, access.board.id);
      const task = await this.lockTask(manager, taskId);
      const evidenceRows = await manager
        .getRepository(TugasTaskEvidenceEntity)
        .find({
          where: { taskId },
          select: { storageKey: true },
        });
      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: TugasActivityAction.DELETE_TASK,
        detail: { judul: task.judul, status: task.status },
        actor,
      });
      const removedTaskId = task.id;
      const removedTaskStatus = task.status;
      await manager.getRepository(TugasTaskEntity).remove(task);
      const remaining = await this.lockStatusTasks(
        manager,
        board.id,
        removedTaskStatus,
        removedTaskId,
      );
      this.normalize(remaining);
      await manager.getRepository(TugasTaskEntity).save(remaining);
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      return {
        board,
        revision: board.revision,
        assignee: access.task.assigneeMember,
        evidenceKeys: evidenceRows.map((evidence) => evidence.storageKey),
        wasOpen: task.status !== TugasTaskStatus.DONE && !task.archivedAt,
      };
    });
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.board.id,
      revision: result.revision,
      action: 'delete_task',
      taskId,
      actor,
    });
    if (result.wasOpen) {
      this.refreshAssignedCounts([result.assignee], actor.company);
    }
    await Promise.allSettled(
      result.evidenceKeys.map((key) => this.storage?.deleteFile(key)),
    );
    return {
      status: 'success',
      message: 'Task berhasil dihapus',
      data: { revision: result.revision },
    };
  }

  async findMyTasks(query: QueryMyTaskDto, actor: TugasActor) {
    const today = this.todayInJakarta();
    const base = this.access.repositories.task
      .createQueryBuilder('task')
      .innerJoinAndSelect('task.board', 'board')
      .innerJoinAndSelect('task.assigneeMember', 'assignee')
      .where('assignee.position_id = :positionId', {
        positionId: actor.position,
      })
      .andWhere('board.company = :company', { company: actor.company })
      .andWhere('board.deleted_at IS NULL')
      .andWhere('task.archived_at IS NULL');
    if (query.boardId)
      base.andWhere('board.id = :boardId', { boardId: query.boardId });
    if (query.prioritas) {
      base.andWhere('task.prioritas = :prioritas', {
        prioritas: query.prioritas,
      });
    }
    if (query.q) {
      base.andWhere(
        '(task.judul LIKE :search OR task.deskripsi LIKE :search)',
        {
          search: `%${query.q}%`,
        },
      );
    }

    const countsRows = await base
      .clone()
      .select(
        `SUM(CASE WHEN task.status != '${TugasTaskStatus.DONE}' AND task.tenggat < :today THEN 1 ELSE 0 END)`,
        'terlambat',
      )
      .addSelect(
        `SUM(CASE WHEN task.status != '${TugasTaskStatus.DONE}' AND task.tenggat = :today THEN 1 ELSE 0 END)`,
        'hariIni',
      )
      .addSelect(
        `SUM(CASE WHEN task.status != '${TugasTaskStatus.DONE}' AND (task.tenggat > :today OR task.tenggat IS NULL) THEN 1 ELSE 0 END)`,
        'mendatang',
      )
      .addSelect(
        `SUM(CASE WHEN task.status = '${TugasTaskStatus.DONE}' THEN 1 ELSE 0 END)`,
        'selesai',
      )
      .setParameter('today', today)
      .getRawOne<Record<keyof MyTaskCounts, string | null>>();

    this.applyMyTaskScope(base, query.scope ?? TugasMyTaskScope.SEMUA, today);
    if (query.status)
      base.andWhere('task.status = :status', { status: query.status });
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [tasks, total] = await base
      .addSelect(
        'CASE WHEN task.tenggat IS NULL THEN 1 ELSE 0 END',
        'tenggatIsNull',
      )
      .addSelect(
        `CASE task.prioritas WHEN '${TugasTaskPriority.TINGGI}' THEN 1 WHEN '${TugasTaskPriority.SEDANG}' THEN 2 WHEN '${TugasTaskPriority.RENDAH}' THEN 3 ELSE 4 END`,
        'priorityOrder',
      )
      .orderBy('tenggatIsNull', 'ASC')
      .addOrderBy('task.tenggat', 'ASC')
      .addOrderBy('priorityOrder', 'ASC')
      .addOrderBy('task.createdAt', 'ASC')
      .addOrderBy('task.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: tasks.map((task) => ({
        ...mapTask(task),
        board: {
          id: task.board.id,
          nama: task.board.nama,
          warna: task.board.warna,
          revision: task.board.revision,
        },
      })),
      counts: this.parseCounts(countsRows),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async setArchiveState(
    taskId: string,
    archive: boolean,
    actor: TugasActor,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskEditor(access);
      const board = await this.lockBoard(manager, access.board.id);
      const task = await this.lockTask(manager, taskId);
      if (archive && task.status !== TugasTaskStatus.DONE) {
        throw new BadRequestException(
          'Hanya task selesai yang dapat diarsipkan',
        );
      }
      if (archive === Boolean(task.archivedAt)) {
        throw new BadRequestException(
          archive ? 'Task sudah diarsipkan' : 'Task tidak sedang diarsipkan',
        );
      }
      task.archivedAt = archive ? new Date() : null;
      if (!archive) {
        const target = await this.lockStatusTasks(
          manager,
          board.id,
          task.status,
          task.id,
        );
        task.urutan = target.length;
      }
      task.updatedByPersnum = actor.persnum;
      await manager.getRepository(TugasTaskEntity).save(task);
      if (archive) {
        const remaining = await this.lockStatusTasks(
          manager,
          board.id,
          task.status,
          task.id,
        );
        this.normalize(remaining);
        await manager.getRepository(TugasTaskEntity).save(remaining);
      }
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: archive
          ? TugasActivityAction.ARCHIVE_TASK
          : TugasActivityAction.RESTORE_TASK,
        detail: { judul: task.judul },
        actor,
      });
      task.assigneeMember = access.task.assigneeMember;
      return { task, board, revision: board.revision };
    });
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.board.id,
      revision: result.revision,
      action: archive ? 'archive_task' : 'unarchive_task',
      taskId,
      actor,
    });
    return {
      status: 'success',
      message: archive
        ? 'Task berhasil diarsipkan'
        : 'Task berhasil dikembalikan',
      data: { ...mapTask(result.task), revision: result.revision },
    };
  }

  private lockBoard(manager: EntityManager, boardId: string) {
    return manager.getRepository(TugasBoardEntity).findOneOrFail({
      where: { id: boardId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Validasi assignee: harus berupa baris membership pada board yang sama.
   * Menolak assigneeMemberId dari board lain agar assignment tidak bisa
   * lintas papan (matriks kolaborasi Phase 3).
   */
  private async resolveAssigneeMember(
    manager: EntityManager,
    boardId: string,
    assigneeMemberId: string,
  ) {
    const member = await manager
      .getRepository(TugasBoardMemberEntity)
      .findOne({ where: { id: assigneeMemberId, boardId } });
    if (!member) {
      throw new BadRequestException(
        'Anggota yang ditugaskan tidak ditemukan pada papan ini',
      );
    }
    return member;
  }

  private lockTask(manager: EntityManager, taskId: string) {
    return manager.getRepository(TugasTaskEntity).findOneOrFail({
      where: { id: taskId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private lockStatusTasks(
    manager: EntityManager,
    boardId: string,
    status: TugasTaskStatus,
    excludedTaskId: string,
  ) {
    return manager
      .getRepository(TugasTaskEntity)
      .createQueryBuilder('task')
      .setLock('pessimistic_write')
      .where('task.board_id = :boardId', { boardId })
      .andWhere('task.status = :status', { status })
      .andWhere('task.id != :excludedTaskId', { excludedTaskId })
      .andWhere('task.archived_at IS NULL')
      .orderBy('task.urutan', 'ASC')
      .addOrderBy('task.id', 'ASC')
      .getMany();
  }

  private normalize(tasks: TugasTaskEntity[]): void {
    tasks.forEach((task, index) => {
      task.urutan = index;
    });
  }

  private refreshAssignedCounts(
    members: Array<TugasBoardMemberEntity | null | undefined>,
    company: string,
  ): void {
    const positions = new Set(
      members.filter(Boolean).map((member) => member!.positionId),
    );
    for (const positionId of positions) {
      this.tugasNotification
        ?.emitAssignedCount(positionId, company)
        .catch(() => undefined);
    }
  }

  private taskDetailSnapshot(task: TugasTaskEntity) {
    return {
      judul: task.judul,
      deskripsi: task.deskripsi,
      prioritas: task.prioritas,
      tenggat: task.tenggat,
    };
  }

  private todayInJakarta(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${value.year}-${value.month}-${value.day}`;
  }

  private applyMyTaskScope(
    qb: ReturnType<typeof this.access.repositories.task.createQueryBuilder>,
    scope: TugasMyTaskScope,
    today: string,
  ): void {
    if (scope === TugasMyTaskScope.TERLAMBAT) {
      qb.andWhere('task.status != :done', {
        done: TugasTaskStatus.DONE,
      }).andWhere('task.tenggat < :today', { today });
    } else if (scope === TugasMyTaskScope.HARI_INI) {
      qb.andWhere('task.status != :done', {
        done: TugasTaskStatus.DONE,
      }).andWhere('task.tenggat = :today', { today });
    } else if (scope === TugasMyTaskScope.MENDATANG) {
      qb.andWhere('task.status != :done', {
        done: TugasTaskStatus.DONE,
      }).andWhere('(task.tenggat > :today OR task.tenggat IS NULL)', { today });
    } else if (scope === TugasMyTaskScope.SELESAI) {
      qb.andWhere('task.status = :done', { done: TugasTaskStatus.DONE });
    }
  }

  private parseCounts(
    row: Record<keyof MyTaskCounts, string | null> | null | undefined,
  ): MyTaskCounts {
    return {
      terlambat: Number(row?.terlambat ?? 0),
      hariIni: Number(row?.hariIni ?? 0),
      mendatang: Number(row?.mendatang ?? 0),
      selesai: Number(row?.selesai ?? 0),
    };
  }
}
