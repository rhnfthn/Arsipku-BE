import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { QueryTaskCommentDto } from '../dto';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskCommentEntity,
  TugasTaskCommentHideEntity,
  TugasTaskEntity,
} from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import {
  COMMENT_DELETED_TOMBSTONE,
  COMMENT_DELETE_WINDOW_MS,
  TugasCommentService,
} from './tugas-comment.service';
import { TugasNotificationService } from './tugas-notification.service';

describe('TugasCommentService', () => {
  const actor: TugasActor = {
    persnum: 10,
    nama: 'Tester',
    company: '1000',
    position: 'POSITION-1',
    positionText: 'Analis',
    role: 'user',
  };

  const otherActor: TugasActor = {
    ...actor,
    persnum: 20,
    position: 'POSITION-2',
  };

  let service: TugasCommentService;
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let access: {
    assertTaskMember: jest.Mock;
    assertBoardMember: jest.Mock;
    repositories: {
      member: { find: jest.Mock };
      task: { find: jest.Mock };
    };
  };
  let activity: { record: jest.Mock };
  let notification: {
    emitCommentAddedSafe: jest.Mock;
    emitCommentDeletedSafe: jest.Mock;
    notifyTagged: jest.Mock;
  };
  let commentRepository: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    remove: jest.Mock;
    findOneOrFail: jest.Mock;
    findOne: jest.Mock;
  };
  let hideRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let taskRepository: { find: jest.Mock; findOne: jest.Mock };

  const board: TugasBoardEntity = {
    id: 'board-1',
    company: '1000',
  } as unknown as TugasBoardEntity;

  const member: TugasBoardMemberEntity = {
    id: 'member-1',
    boardId: 'board-1',
    persnum: 10,
    positionId: 'POSITION-1',
    namaSnapshot: 'Tester',
    positionTextSnapshot: 'Analis',
  } as unknown as TugasBoardMemberEntity;

  const otherMember: TugasBoardMemberEntity = {
    id: 'member-2',
    boardId: 'board-1',
    persnum: 20,
    positionId: 'POSITION-2',
    namaSnapshot: 'Other',
    positionTextSnapshot: 'Staf',
  } as unknown as TugasBoardMemberEntity;

  const task: TugasTaskEntity = {
    id: 'task-1',
    boardId: 'board-1',
    judul: 'Task contoh',
  } as unknown as TugasTaskEntity;

  const buildComment = (overrides: Partial<TugasTaskCommentEntity> = {}) =>
    ({
      id: uuidv4(),
      boardId: 'board-1',
      taskId: null,
      memberId: 'member-1',
      isi: 'Halo, ini komentar',
      actorPersnum: 10,
      actorPositionId: 'POSITION-1',
      createdAt: new Date('2026-09-17T02:00:00Z'),
      ...overrides,
    }) as TugasTaskCommentEntity;

  beforeEach(() => {
    commentRepository = {
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
      remove: jest.fn(),
      findOneOrFail: jest.fn(),
      findOne: jest.fn(),
    };

    hideRepository = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(),
      create: jest.fn((value) => value),
    };

    taskRepository = {
      find: jest.fn(async () => [task]),
      findOne: jest.fn(async () => task),
    };

    dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => unknown) =>
          callback({
            getRepository: (entity: unknown) =>
              entity === TugasTaskCommentHideEntity
                ? hideRepository
                : entity === TugasTaskEntity
                  ? taskRepository
                  : commentRepository,
          } as unknown as EntityManager),
      ),
      getRepository: jest.fn((entity: unknown) =>
        entity === TugasTaskCommentHideEntity
          ? hideRepository
          : entity === TugasTaskEntity
            ? taskRepository
            : commentRepository,
      ),
    };

    access = {
      assertTaskMember: jest.fn(async () => ({
        board,
        member,
        task,
      })),
      assertBoardMember: jest.fn(async () => ({
        board,
        member,
      })),
      repositories: {
        member: {
          find: jest.fn(async () => [member, otherMember]),
        },
        task: {
          find: jest.fn(async () => [task]),
        },
      },
    };

    activity = { record: jest.fn() };
    notification = {
      emitCommentAddedSafe: jest.fn(),
      emitCommentDeletedSafe: jest.fn(),
      notifyTagged: jest.fn(async () => undefined),
    };

    service = new TugasCommentService(
      dataSource as unknown as DataSource,
      access as unknown as TugasAccessReader,
      activity as unknown as TugasActivityService,
      notification as unknown as TugasNotificationService,
    );
  });

  describe('add', () => {
    it('menyimpan komentar forum papan milik member aktif dan emit realtime', async () => {
      const saved = buildComment();
      commentRepository.save.mockResolvedValue(saved);

      const result = await service.add('board-1', { isi: 'Halo' }, actor);

      expect(commentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          boardId: 'board-1',
          taskId: null,
          memberId: 'member-1',
          isi: 'Halo',
          actorPersnum: 10,
          actorPositionId: 'POSITION-1',
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          boardId: 'board-1',
          aksi: TugasActivityAction.ADD_COMMENT,
        }),
      );
      expect(notification.emitCommentAddedSafe).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: 'board-1' }),
      );
      expect(result.status).toBe('success');
      expect(result.data.actor.nama).toBe('Tester');
    });

    it('menerima tag task opsional dan menyimpan taskJudul di aktivitas', async () => {
      const saved = buildComment({ taskId: 'task-1' });
      commentRepository.save.mockResolvedValue(saved);
      taskRepository.findOne.mockResolvedValue(task);

      const result = await service.add(
        'board-1',
        { isi: 'Terkait task ini', taskId: 'task-1' },
        actor,
      );

      expect(taskRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'task-1', boardId: 'board-1' },
      });
      expect(commentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          detail: expect.objectContaining({ judul: 'Task contoh' }),
        }),
      );
      expect(result.status).toBe('success');
    });

    it('menolak tag task dari papan lain', async () => {
      taskRepository.findOne.mockResolvedValue(null);

      await expect(
        service.add('board-1', { isi: 'Halo', taskId: 'task-lain' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(commentRepository.save).not.toHaveBeenCalled();
    });

    it('mengirim notifikasi hanya kepada anggota lain yang di-tag', async () => {
      const saved = buildComment({ isi: 'Halo @Other dan @Tester' });
      commentRepository.save.mockResolvedValue(saved);

      await service.add('board-1', { isi: 'Halo @Other dan @Tester' }, actor);

      expect(notification.notifyTagged).toHaveBeenCalledWith({
        board,
        taggedMembers: [
          {
            memberId: otherMember.id,
            positionId: otherMember.positionId,
            persnum: otherMember.persnum,
            nama: otherMember.namaSnapshot,
          },
        ],
        actor,
      });
    });

    it('tidak ikut men-tag nama pendek ketika nama panjang yang disebut', async () => {
      const shortNameMember = {
        ...otherMember,
        id: 'member-short',
        persnum: 30,
        positionId: 'POSITION-3',
        namaSnapshot: 'Budi',
      } as TugasBoardMemberEntity;
      const longNameMember = {
        ...otherMember,
        id: 'member-long',
        persnum: 40,
        positionId: 'POSITION-4',
        namaSnapshot: 'Budi Santoso',
      } as TugasBoardMemberEntity;
      access.repositories.member.find.mockResolvedValue([
        member,
        shortNameMember,
        longNameMember,
      ]);
      commentRepository.save.mockResolvedValue(
        buildComment({ isi: 'Mohon dicek @Budi Santoso' }),
      );

      await service.add(
        'board-1',
        { isi: 'Mohon dicek @Budi Santoso' },
        actor,
      );

      expect(notification.notifyTagged).toHaveBeenCalledWith(
        expect.objectContaining({
          taggedMembers: [
            expect.objectContaining({ memberId: longNameMember.id }),
          ],
        }),
      );
    });
  });

  describe('remove', () => {
    it('scope=me: menyembunyikan komentar tanpa menghapus untuk orang lain', async () => {
      const comment = buildComment({ memberId: 'member-2' });
      commentRepository.findOneOrFail.mockResolvedValue(comment);

      const result = await service.remove('board-1', comment.id, 'me', actor);

      expect(hideRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          commentId: comment.id,
          memberId: 'member-1',
        }),
      );
      expect(commentRepository.remove).not.toHaveBeenCalled();
      expect(notification.emitCommentDeletedSafe).not.toHaveBeenCalled();
      expect(result.status).toBe('success');
    });

    it('scope=me: idempoten bila komentar sudah disembunyikan', async () => {
      const comment = buildComment({ memberId: 'member-2' });
      commentRepository.findOneOrFail.mockResolvedValue(comment);
      hideRepository.findOne.mockResolvedValue({ id: 'hide-1' });

      await service.remove('board-1', comment.id, 'me', actor);

      expect(hideRepository.save).not.toHaveBeenCalled();
    });

    it('scope=everyone: mengganti isi dengan tombstone dalam window 5 menit', async () => {
      const comment = buildComment({
        memberId: 'member-1',
        createdAt: new Date(Date.now() - 60 * 1000), // 1 menit lalu
      });
      commentRepository.findOneOrFail.mockResolvedValue(comment);

      const result = await service.remove(
        'board-1',
        comment.id,
        'everyone',
        actor,
      );

      expect(commentRepository.remove).not.toHaveBeenCalled();
      expect(commentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: comment.id,
          isi: COMMENT_DELETED_TOMBSTONE,
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          aksi: TugasActivityAction.DELETE_COMMENT,
        }),
      );
      expect(notification.emitCommentDeletedSafe).toHaveBeenCalled();
      expect(result.status).toBe('success');
    });

    it('scope=everyone: menolak hapus setelah window 5 menit berlalu', async () => {
      const comment = buildComment({
        memberId: 'member-1',
        createdAt: new Date(Date.now() - COMMENT_DELETE_WINDOW_MS - 1000),
      });
      commentRepository.findOneOrFail.mockResolvedValue(comment);

      await expect(
        service.remove('board-1', comment.id, 'everyone', actor),
      ).rejects.toThrow(BadRequestException);
      expect(commentRepository.remove).not.toHaveBeenCalled();
    });

    it('scope=everyone: menolak hapus komentar milik anggota lain', async () => {
      const comment = buildComment({
        memberId: 'member-2',
        createdAt: new Date(),
      });
      commentRepository.findOneOrFail.mockResolvedValue(comment);

      await expect(
        service.remove('board-1', comment.id, 'everyone', actor),
      ).rejects.toThrow(ForbiddenException);
      expect(commentRepository.remove).not.toHaveBeenCalled();
    });

    it('melempar NotFound bila komentar tidak ada', async () => {
      commentRepository.findOneOrFail.mockRejectedValue(new Error('not found'));

      await expect(
        service.remove('board-1', 'missing-comment', 'me', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('mengembalikan komentar terbaru duluan dengan meta pagination', async () => {
      const comments = [buildComment(), buildComment()];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [comments, 2]),
      };
      commentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.list(
        'board-1',
        { page: 1, limit: 50 } as QueryTaskCommentDto,
        actor,
      );

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'comment.board_id = :boardId',
        { boardId: 'board-1' },
      );
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(result.data[0]!.actor.nama).toBe('Tester');
    });

    it('tidak membocorkan isi dan tag task dari komentar tombstone', async () => {
      const deletedComment = buildComment({
        taskId: task.id,
        isi: COMMENT_DELETED_TOMBSTONE,
      });
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [[deletedComment], 1]),
      };
      commentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.list(
        'board-1',
        { page: 1, limit: 50 } as QueryTaskCommentDto,
        actor,
      );

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          isi: '',
          taskId: null,
          taskJudul: null,
          isDeletedForEveryone: true,
        }),
      );
    });
  });
});
