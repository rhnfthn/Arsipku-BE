import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreateBoardDto, QueryBoardDto, UpdateBoardDto } from '../dto';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
} from '../entities';
import {
  TugasActivityAction,
  TugasBoardFilter,
  TugasBoardMemberRole,
  TugasBoardType,
  TugasTaskStatus,
} from '../enums';
import {
  emptyTaskCounts,
  mapBoard,
  mapMember,
  TugasTaskCounts,
} from '../tugas-response.mapper';
import { TugasActor, TugasPage } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';

@Injectable()
export class TugasBoardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: TugasAccessReader,
    private readonly activity: TugasActivityService,
    private readonly tugasNotification: TugasNotificationService,
  ) {}

  async create(dto: CreateBoardDto, actor: TugasActor) {
    const board = await this.dataSource.transaction(async (manager) => {
      const boardRepository = manager.getRepository(TugasBoardEntity);
      const memberRepository = manager.getRepository(TugasBoardMemberEntity);
      const boardId = uuidv4();
      const createdBoard = await boardRepository.save(
        boardRepository.create({
          id: boardId,
          company: actor.company,
          nama: dto.nama,
          deskripsi: dto.deskripsi || null,
          tipe: dto.tipe ?? TugasBoardType.PERSONAL,
          icon: dto.icon || null,
          warna: dto.warna ?? '#808080',
          revision: 0,
          createdByPersnum: actor.persnum,
          createdByPositionId: actor.position,
        }),
      );
      await memberRepository.save(
        memberRepository.create({
          id: uuidv4(),
          boardId,
          persnum: actor.persnum,
          positionId: actor.position,
          namaSnapshot: actor.nama,
          positionTextSnapshot: actor.positionText || null,
          role: TugasBoardMemberRole.OWNER,
        }),
      );
      await this.activity.record(manager, {
        boardId,
        aksi: TugasActivityAction.CREATE_BOARD,
        detail: { nama: createdBoard.nama, tipe: createdBoard.tipe },
        actor,
      });
      return createdBoard;
    });

    return {
      status: 'success',
      message: 'Papan tugas berhasil dibuat',
      data: mapBoard(board),
    };
  }

  async findAll(
    query: QueryBoardDto,
    actor: TugasActor,
  ): Promise<TugasPage<ReturnType<typeof mapBoard>>> {
    const { board: boardRepository } = this.access.repositories;
    const qb = boardRepository
      .createQueryBuilder('board')
      .innerJoin(
        'board.members',
        'member',
        'member.position_id = :positionId',
        { positionId: actor.position },
      )
      .where('board.company = :company', { company: actor.company })
      .andWhere('board.deleted_at IS NULL');

    if (query.filter === TugasBoardFilter.SAYA_BUAT) {
      qb.andWhere('member.role = :owner', {
        owner: TugasBoardMemberRole.OWNER,
      });
    } else if (query.filter === TugasBoardFilter.SAYA_IKUT) {
      qb.andWhere('member.role = :member', {
        member: TugasBoardMemberRole.MEMBER,
      });
    }
    if (query.q) {
      qb.andWhere('(board.nama LIKE :search OR board.deskripsi LIKE :search)', {
        search: `%${query.q}%`,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [boards, total] = await qb
      .orderBy('board.updatedAt', 'DESC')
      .addOrderBy('board.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const counts = await this.getCounts(boards.map((board) => board.id));

    // Owner (pembuat papan) untuk info PIC di kartu — satu query tambahan,
    // bukan N+1 per board.
    const ownerMap = new Map<string, TugasBoardMemberEntity>();
    if (boards.length) {
      const owners = await this.access.repositories.member.find({
        where: boards.map((board) => ({
          boardId: board.id,
          role: TugasBoardMemberRole.OWNER,
        })),
      });
      for (const owner of owners) ownerMap.set(owner.boardId, owner);
    }

    return {
      data: boards.map((board) =>
        mapBoard(
          board,
          counts.get(board.id) ?? emptyTaskCounts(),
          ownerMap.get(board.id) ?? null,
        ),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(boardId: string, actor: TugasActor) {
    const { board } = await this.access.assertBoardMember(
      boardId,
      actor.company,
      actor.position,
    );
    const { member, task } = this.access.repositories;
    const [members, rawCounts] = await Promise.all([
      member.find({ where: { boardId }, order: { createdAt: 'ASC' } }),
      task
        .createQueryBuilder('task')
        .select('task.status', 'status')
        .addSelect('COUNT(*)', 'total')
        .where('task.board_id = :boardId', { boardId })
        .andWhere('task.archived_at IS NULL')
        .groupBy('task.status')
        .getRawMany<{ status: TugasTaskStatus; total: string }>(),
    ]);
    const counts = this.toCounts(rawCounts);
    return {
      status: 'success',
      message: 'Detail papan tugas berhasil diambil',
      data: { ...mapBoard(board, counts), members: members.map(mapMember) },
    };
  }

  async update(boardId: string, dto: UpdateBoardDto, actor: TugasActor) {
    const board = await this.dataSource.transaction(async (manager) => {
      const { board: current } = await this.access.assertBoardOwner(
        boardId,
        actor.company,
        actor.position,
        manager,
      );
      const before = {
        nama: current.nama,
        deskripsi: current.deskripsi,
        tipe: current.tipe,
        icon: current.icon,
        warna: current.warna,
      };
      if (dto.nama !== undefined) current.nama = dto.nama;
      if (dto.deskripsi !== undefined)
        current.deskripsi = dto.deskripsi || null;
      if (dto.tipe !== undefined) {
        await this.assertBoardTypeTransition(manager, current, dto.tipe);
        current.tipe = dto.tipe;
      }
      if (dto.icon !== undefined) current.icon = dto.icon || null;
      if (dto.warna !== undefined) current.warna = dto.warna;
      current.revision += 1;
      const saved = await manager.getRepository(TugasBoardEntity).save(current);
      await this.activity.record(manager, {
        boardId,
        aksi: TugasActivityAction.UPDATE_BOARD,
        detail: {
          before,
          after: {
            nama: saved.nama,
            deskripsi: saved.deskripsi,
            tipe: saved.tipe,
            icon: saved.icon,
            warna: saved.warna,
          },
        },
        actor,
      });
      return saved;
    });
    return {
      status: 'success',
      message: 'Papan tugas berhasil diperbarui',
      data: mapBoard(board),
    };
  }

  /**
   * Constraint tipe papan (Phase 3):
   * - personal -> bersama: selalu boleh (membuka kolaborasi).
   * - bersama -> personal: hanya jika tidak ada member selain owner dan
   *   tidak ada task yang masih ditugaskan ke member (assignment terkait).
   */
  private async assertBoardTypeTransition(
    manager: EntityManager,
    board: TugasBoardEntity,
    next: TugasBoardType,
  ) {
    if (next !== TugasBoardType.PERSONAL) return;
    if (board.tipe !== TugasBoardType.BERSAMA) return;
    const memberRepository = manager.getRepository(TugasBoardMemberEntity);
    const otherMembers = await memberRepository.count({
      where: { boardId: board.id },
    });
    if (otherMembers > 1) {
      throw new BadRequestException(
        'Hapus seluruh anggota lain sebelum mengubah papan menjadi personal',
      );
    }
    const assignedCount = await manager
      .getRepository(TugasTaskEntity)
      .createQueryBuilder('task')
      .where('task.board_id = :boardId', { boardId: board.id })
      .andWhere('task.assignee_member_id IS NOT NULL')
      .getCount();
    if (assignedCount > 0) {
      throw new BadRequestException(
        'Lepas seluruh penugasan task sebelum mengubah papan menjadi personal',
      );
    }
  }

  async remove(boardId: string, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const { board } = await this.access.assertBoardOwner(
        boardId,
        actor.company,
        actor.position,
        manager,
      );
      await this.activity.record(manager, {
        boardId,
        aksi: TugasActivityAction.DELETE_BOARD,
        detail: { nama: board.nama },
        actor,
      });
      board.deletedAt = new Date();
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      const members = await manager
        .getRepository(TugasBoardMemberEntity)
        .find({ where: { boardId } });
      return { board, members };
    });
    this.publishBoardAvailability(
      result.board,
      result.members,
      'delete_board',
      actor,
    );
    return { status: 'success', message: 'Papan tugas berhasil dihapus' };
  }

  async restore(boardId: string, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const member = await manager
        .getRepository(TugasBoardMemberEntity)
        .createQueryBuilder('member')
        .withDeleted()
        .innerJoinAndSelect('member.board', 'board')
        .where('member.board_id = :boardId', { boardId })
        .andWhere('member.position_id = :positionId', {
          positionId: actor.position,
        })
        .andWhere('board.company = :company', { company: actor.company })
        .getOne();
      if (!member || !member.board.deletedAt) {
        throw new NotFoundException('Papan tugas terhapus tidak ditemukan');
      }
      if (member.role !== TugasBoardMemberRole.OWNER) {
        throw new ForbiddenException(
          'Hanya pemilik papan yang dapat melakukan aksi ini',
        );
      }
      member.board.deletedAt = null;
      member.board.revision += 1;
      const saved = await manager
        .getRepository(TugasBoardEntity)
        .save(member.board);
      await this.activity.record(manager, {
        boardId,
        aksi: TugasActivityAction.RESTORE_BOARD,
        detail: { nama: saved.nama },
        actor,
      });
      const members = await manager
        .getRepository(TugasBoardMemberEntity)
        .find({ where: { boardId } });
      return { board: saved, members };
    });
    this.publishBoardAvailability(
      result.board,
      result.members,
      'restore_board',
      actor,
    );
    return {
      status: 'success',
      message: 'Papan tugas berhasil dipulihkan',
      data: mapBoard(result.board),
    };
  }

  private publishBoardAvailability(
    board: TugasBoardEntity,
    members: TugasBoardMemberEntity[],
    action: string,
    actor: TugasActor,
  ): void {
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: board.id,
      revision: board.revision,
      action,
      actor,
    });
    for (const positionId of new Set(
      members.map((member) => member.positionId),
    )) {
      this.tugasNotification
        ?.emitAssignedCount(positionId, board.company)
        .catch(() => undefined);
    }
  }

  private async getCounts(boardIds: string[]) {
    const result = new Map<string, TugasTaskCounts>();
    if (!boardIds.length) return result;
    const rows = await this.access.repositories.task
      .createQueryBuilder('task')
      .select('task.board_id', 'boardId')
      .addSelect('task.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .where('task.board_id IN (:...boardIds)', { boardIds })
      .andWhere('task.archived_at IS NULL')
      .groupBy('task.board_id')
      .addGroupBy('task.status')
      .getRawMany<{
        boardId: string;
        status: TugasTaskStatus;
        total: string;
      }>();
    for (const boardId of boardIds) {
      result.set(
        boardId,
        this.toCounts(rows.filter((row) => row.boardId === boardId)),
      );
    }
    return result;
  }

  private toCounts(rows: { status: TugasTaskStatus; total: string }[]) {
    const counts = emptyTaskCounts();
    for (const row of rows) {
      const total = Number(row.total);
      counts.total += total;
      if (row.status === TugasTaskStatus.TODO) counts.todo = total;
      if (row.status === TugasTaskStatus.IN_PROGRESS) counts.inProgress = total;
      if (row.status === TugasTaskStatus.DONE) counts.done = total;
    }
    return counts;
  }
}
