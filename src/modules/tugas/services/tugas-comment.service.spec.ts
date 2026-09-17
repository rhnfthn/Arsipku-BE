import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { QueryTaskCommentDto } from '../dto';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskCommentEntity,
  TugasTaskEntity,
} from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasCommentService } from './tugas-comment.service';
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
    repositories: { member: { find: jest.Mock } };
  };
  let activity: { record: jest.Mock };
  let notification: {
    emitCommentAddedSafe: jest.Mock;
    emitCommentDeletedSafe: jest.Mock;
  };
  let commentRepository: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    remove: jest.Mock;
    findOneOrFail: jest.Mock;
  };

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
      taskId: 'task-1',
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
    };

    dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => unknown) =>
          callback({
            getRepository: () => commentRepository,
          } as unknown as EntityManager),
      ),
      getRepository: jest.fn(() => commentRepository),
    };

    access = {
      assertTaskMember: jest.fn(async () => ({
        board,
        member,
        task,
      })),
      repositories: {
        member: {
          find: jest.fn(async () => [member, otherMember]),
        },
      },
    };

    activity = { record: jest.fn() };
    notification = {
      emitCommentAddedSafe: jest.fn(),
      emitCommentDeletedSafe: jest.fn(),
    };

    service = new TugasCommentService(
      dataSource as unknown as DataSource,
      access as unknown as TugasAccessReader,
      activity as unknown as TugasActivityService,
      notification as unknown as TugasNotificationService,
    );
  });

  describe('add', () => {
    it('menyimpan komentar milik member aktif dan emit realtime', async () => {
      const saved = buildComment();
      commentRepository.save.mockResolvedValue(saved);

      const result = await service.add('task-1', { isi: 'Halo' }, actor);

      expect(commentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
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
          taskId: 'task-1',
          aksi: TugasActivityAction.ADD_COMMENT,
        }),
      );
      expect(notification.emitCommentAddedSafe).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: 'board-1', taskId: 'task-1' }),
      );
      expect(result.status).toBe('success');
      expect(result.data.actor.nama).toBe('Tester');
    });
  });

  describe('remove', () => {
    it('menghapus komentar milik sendiri', async () => {
      const comment = buildComment({ memberId: 'member-1' });
      commentRepository.findOneOrFail.mockResolvedValue(comment);

      const result = await service.remove('task-1', comment.id, actor);

      expect(commentRepository.remove).toHaveBeenCalledWith(comment);
      expect(activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          aksi: TugasActivityAction.DELETE_COMMENT,
        }),
      );
      expect(notification.emitCommentDeletedSafe).toHaveBeenCalled();
      expect(result.status).toBe('success');
    });

    it('menolak hapus komentar milik anggota lain', async () => {
      const comment = buildComment({ memberId: 'member-2' });
      commentRepository.findOneOrFail.mockResolvedValue(comment);

      await expect(
        service.remove('task-1', comment.id, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(commentRepository.remove).not.toHaveBeenCalled();
    });

    it('melempar NotFound bila komentar tidak ada', async () => {
      commentRepository.findOneOrFail.mockRejectedValue(new Error('not found'));

      await expect(
        service.remove('task-1', 'missing-comment', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('mengembalikan komentar terbaru duluan dengan meta pagination', async () => {
      const comments = [buildComment(), buildComment()];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [comments, 2]),
      };
      commentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.list(
        'task-1',
        { page: 1, limit: 50 } as QueryTaskCommentDto,
        actor,
      );

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(result.data[0]!.actor.nama).toBe('Tester');
    });
  });
});