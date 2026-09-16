import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { QueryMemberCandidateDto, AddBoardMemberDto } from '../dto';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
} from '../entities';
import {
  TugasActivityAction,
  TugasBoardMemberRole,
  TugasBoardType,
} from '../enums';
import { mapMember } from '../tugas-response.mapper';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';

export interface TugasPositionCandidate {
  positionId: string;
  persnum: number;
  nama: string;
  positionText: string;
}

interface OrgPositionRow {
  position?: number | string;
  company?: number | string;
  position_text?: string | null;
  persnum_person?: number | null;
  persnum_person_text?: string | null;
}

const CANDIDATE_MIN_QUERY = 2;

const toText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

@Injectable()
export class TugasMemberService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: TugasAccessReader,
    private readonly activity: TugasActivityService,
    private readonly orgDataService: OrgDataService,
    private readonly tugasNotification: TugasNotificationService,
  ) {}

  /**
   * GET /tugas/member-candidates
   *
   * Pencarian kandidat anggota TANPA board — dipakai form "Buat Papan"
   * saat user memilih tipe bersama dan ingin mengajak anggota sejak awal.
   * Company diambil dari actor (bukan board), exclude posisi actor sendiri.
   * Semua posisi aktif (managerial & staf) dalam company bisa ditemukan.
   */
  async findGlobalCandidates(query: QueryMemberCandidateDto, actor: TugasActor) {
    const keyword = query.q.trim().toLowerCase();
    if (keyword.length < CANDIDATE_MIN_QUERY) {
      throw new BadRequestException('Kata kunci pencarian minimal 2 karakter');
    }

    const snapshot = await this.orgDataService.findLatestPositionSnapshot();
    if (!snapshot || !Array.isArray(snapshot.position_json)) {
      throw new ServiceUnavailableException(
        'Data organisasi tidak tersedia saat ini',
      );
    }

    const actorCompany = String(actor.company);
    const candidates: TugasPositionCandidate[] = [];
    for (const row of snapshot.position_json as OrgPositionRow[]) {
      const positionId = toText(row.position);
      const persnum = Number(row.persnum_person ?? 0);
      const nama = toText(row.persnum_person_text);
      const positionText = toText(row.position_text);
      const company = toText(row.company);
      if (!positionId || !persnum || !nama) continue;
      if (company !== actorCompany) continue;
      // Exclude posisi actor sendiri — otomatis owner papan baru.
      if (positionId === String(actor.position)) continue;
      const haystack = `${nama} ${positionText}`.toLowerCase();
      if (!haystack.includes(keyword)) continue;
      candidates.push({ positionId, persnum, nama, positionText });
    }
    candidates.sort((a, b) => a.nama.localeCompare(b.nama));

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const total = candidates.length;
    const start = (page - 1) * limit;
    const data = candidates.slice(start, start + limit);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * GET /tugas/boards/:boardId/member-candidates
   *
   * Hanya owner dengan permission manage-members yang boleh mencari.
   * Company ditentukan board, bukan query client. Hasil hanya posisi aktif
   * (punya person) dalam company board, exclude owner/member yang sudah ada.
   */
  async findCandidates(
    boardId: string,
    query: QueryMemberCandidateDto,
    actor: TugasActor,
  ) {
    const { board } = await this.access.assertBoardOwner(
      boardId,
      actor.company,
      actor.position,
    );
    if (board.tipe !== TugasBoardType.BERSAMA) {
      throw new BadRequestException(
        'Ubah tipe papan menjadi bersama sebelum menambah anggota',
      );
    }

    const keyword = query.q.trim().toLowerCase();
    if (keyword.length < CANDIDATE_MIN_QUERY) {
      throw new BadRequestException('Kata kunci pencarian minimal 2 karakter');
    }

    const snapshot = await this.orgDataService.findLatestPositionSnapshot();
    if (!snapshot || !Array.isArray(snapshot.position_json)) {
      throw new ServiceUnavailableException(
        'Data organisasi tidak tersedia saat ini',
      );
    }

    const existing = await this.access.repositories.member.find({
      where: { boardId },
    });
    const existingPositions = new Set(
      existing.map((member) => String(member.positionId)),
    );

    const boardCompany = String(board.company);
    const candidates: TugasPositionCandidate[] = [];
    for (const row of snapshot.position_json as OrgPositionRow[]) {
      const positionId = toText(row.position);
      const persnum = Number(row.persnum_person ?? 0);
      const nama = toText(row.persnum_person_text);
      const positionText = toText(row.position_text);
      const company = toText(row.company);
      if (!positionId || !persnum || !nama) continue;
      if (company !== boardCompany) continue;
      if (existingPositions.has(positionId)) continue;
      const haystack = `${nama} ${positionText}`.toLowerCase();
      if (!haystack.includes(keyword)) continue;
      candidates.push({ positionId, persnum, nama, positionText });
    }
    candidates.sort((a, b) => a.nama.localeCompare(b.nama));

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const total = candidates.length;
    const start = (page - 1) * limit;
    const data = candidates.slice(start, start + limit);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * POST /tugas/boards/:boardId/members
   *
   * Menerima positionId; backend resolve persnum + snapshot dari data
   * organisasi. Tolak: company lain, posisi tidak aktif, duplikat, owner kedua.
   */
  async add(boardId: string, dto: AddBoardMemberDto, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const { board } = await this.access.assertBoardOwner(
        boardId,
        actor.company,
        actor.position,
        manager,
      );
      if (board.tipe !== TugasBoardType.BERSAMA) {
        throw new BadRequestException(
          'Ubah tipe papan menjadi bersama sebelum menambah anggota',
        );
      }

      const candidate = await this.resolvePosition(
        dto.positionId,
        String(board.company),
      );

      const memberRepository = manager.getRepository(TugasBoardMemberEntity);
      const duplicate = await memberRepository.findOne({
        where: { boardId, positionId: candidate.positionId },
      });
      if (duplicate) {
        throw new BadRequestException(
          'Posisi tersebut sudah menjadi anggota papan',
        );
      }

      const member = await memberRepository.save(
        memberRepository.create({
          id: uuidv4(),
          boardId,
          persnum: candidate.persnum,
          positionId: candidate.positionId,
          namaSnapshot: candidate.nama,
          positionTextSnapshot: candidate.positionText,
          role: TugasBoardMemberRole.MEMBER,
        }),
      );

      const lockedBoard = await this.lockBoard(manager, boardId);
      lockedBoard.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(lockedBoard);

      await this.activity.record(manager, {
        boardId,
        aksi: TugasActivityAction.ADD_MEMBER,
        detail: {
          nama: member.namaSnapshot,
          positionText: member.positionTextSnapshot,
          positionId: member.positionId,
        },
        actor,
      });
      return { member, board: lockedBoard, revision: lockedBoard.revision };
    });

    // Notifikasi anggota baru SETELAH commit; kegagalan tidak membatalkan
    // mutasi domain (fire-and-forget dengan logger di dalam service).
    this.tugasNotification
      ?.notifyMemberAdded({
        board: result.board,
        memberPositionId: result.member.positionId,
        memberPersnum: result.member.persnum,
        actor,
      })
      .catch(() => undefined);
    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId,
      revision: result.revision,
      action: 'add_member',
      actor,
    });

    return {
      status: 'success',
      message: 'Anggota berhasil ditambahkan',
      data: { ...mapMember(result.member), revision: result.revision },
    };
  }

  /**
   * DELETE /tugas/boards/:boardId/members/:memberId
   *
   * Dalam satu transaction: lock membership, tolak owner, null-kan assignee
   * dan creator member reference terkait, catat unassign_task +
   * remove_member, increment board revision.
   */
  async remove(boardId: string, memberId: string, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      await this.access.assertBoardOwner(
        boardId,
        actor.company,
        actor.position,
        manager,
      );

      const memberRepository = manager.getRepository(TugasBoardMemberEntity);
      const member = await memberRepository
        .createQueryBuilder('member')
        .setLock('pessimistic_write')
        .where('member.id = :memberId', { memberId })
        .andWhere('member.board_id = :boardId', { boardId })
        .getOne();
      if (!member) {
        throw new NotFoundException('Anggota tidak ditemukan');
      }
      if (member.role === TugasBoardMemberRole.OWNER) {
        throw new ForbiddenException(
          'Pemilik papan tidak dapat dihapus dari papan',
        );
      }

      const taskRepository = manager.getRepository(TugasTaskEntity);
      const assignedTasks = await taskRepository
        .createQueryBuilder('task')
        .setLock('pessimistic_write')
        .where('task.board_id = :boardId', { boardId })
        .andWhere('task.assignee_member_id = :memberId', { memberId })
        .getMany();
      for (const task of assignedTasks) {
        task.assigneeMemberId = null;
        task.updatedByPersnum = actor.persnum;
        await this.activity.record(manager, {
          boardId,
          taskId: task.id,
          aksi: TugasActivityAction.UNASSIGN_TASK,
          detail: {
            judul: task.judul,
            reason: 'remove_member',
            removedMember: member.namaSnapshot,
          },
          actor,
        });
      }
      if (assignedTasks.length) {
        await taskRepository.save(assignedTasks);
      }

      await memberRepository.remove(member);

      const lockedBoard = await this.lockBoard(manager, boardId);
      lockedBoard.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(lockedBoard);

      await this.activity.record(manager, {
        boardId,
        aksi: TugasActivityAction.REMOVE_MEMBER,
        detail: {
          nama: member.namaSnapshot,
          positionText: member.positionTextSnapshot,
          positionId: member.positionId,
        },
        actor,
      });
      return {
        removed: member,
        board: lockedBoard,
        unassignedTaskCount: assignedTasks.length,
        revision: lockedBoard.revision,
      };
    });

    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId,
      revision: result.revision,
      action: 'remove_member',
      actor,
    });
    this.tugasNotification
      ?.emitAssignedCount(result.removed.positionId, result.board.company)
      .catch(() => undefined);

    return {
      status: 'success',
      message: 'Anggota berhasil dihapus',
      data: {
        id: result.removed.id,
        unassignedTaskCount: result.unassignedTaskCount,
        revision: result.revision,
      },
    };
  }

  private async resolvePosition(
    positionId: string,
    boardCompany: string,
  ): Promise<TugasPositionCandidate> {
    const snapshot = await this.orgDataService.findLatestPositionSnapshot();
    if (!snapshot || !Array.isArray(snapshot.position_json)) {
      throw new ServiceUnavailableException(
        'Data organisasi tidak tersedia saat ini',
      );
    }
    const rows = snapshot.position_json as OrgPositionRow[];
    const row = rows.find((item) => toText(item.position) === positionId);
    if (!row) {
      throw new NotFoundException(
        'Posisi tidak ditemukan dalam data organisasi',
      );
    }
    const persnum = Number(row.persnum_person ?? 0);
    const nama = toText(row.persnum_person_text);
    if (!persnum || !nama) {
      throw new BadRequestException(
        'Posisi tersebut sedang tidak aktif atau tidak memiliki pegawai',
      );
    }
    if (toText(row.company) !== boardCompany) {
      throw new BadRequestException(
        'Posisi tersebut berada di luar company papan',
      );
    }
    return {
      positionId,
      persnum,
      nama,
      positionText: toText(row.position_text),
    };
  }

  private lockBoard(manager: EntityManager, boardId: string) {
    return manager.getRepository(TugasBoardEntity).findOneOrFail({
      where: { id: boardId },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
