/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
} from '../entities';
import { TugasBoardMemberRole, TugasTaskStatus } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasTaskService } from './tugas-task.service';

const actor: TugasActor = {
  persnum: 100,
  nama: 'Pemilik',
  company: '1000',
  position: 'POS-1',
  positionText: 'Manager',
  role: 'user',
};

const member = {
  id: 'member-1',
  role: TugasBoardMemberRole.OWNER,
} as TugasBoardMemberEntity;

const makeTask = (
  id: string,
  status: TugasTaskStatus,
  urutan: number,
): TugasTaskEntity =>
  ({
    id,
    boardId: 'board-1',
    judul: id,
    deskripsi: null,
    status,
    urutan,
    prioritas: null,
    tenggat: null,
    assigneeMemberId: member.id,
    assigneeMember: member,
    selesaiAt: null,
    archivedAt: null,
    reminderH1SentAt: null,
    createdByMemberId: member.id,
    createdByPersnum: actor.persnum,
    updatedByPersnum: actor.persnum,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as TugasTaskEntity;

function createMoveHarness(revision = 7) {
  const task = makeTask('moving', TugasTaskStatus.TODO, 1);
  const source = [makeTask('todo-a', TugasTaskStatus.TODO, 0)];
  const target = [
    makeTask('done-a', TugasTaskStatus.DONE, 0),
    makeTask('done-b', TugasTaskStatus.DONE, 1),
  ];
  const board = { id: 'board-1', revision } as TugasBoardEntity;
  const savedTaskBatches: TugasTaskEntity[][] = [];
  const taskRepository = {
    findOneOrFail: jest.fn(() => Promise.resolve(task)),
    find: jest.fn(() => Promise.resolve([])),
    remove: jest.fn(() => Promise.resolve(task)),
    save: jest.fn((value) => {
      if (Array.isArray(value)) savedTaskBatches.push(value);
      return Promise.resolve(value);
    }),
    createQueryBuilder: jest
      .fn()
      .mockImplementationOnce(() => lockedQuery(source))
      .mockImplementationOnce(() => lockedQuery(target)),
  };
  const boardRepository = {
    findOneOrFail: jest.fn(() => Promise.resolve(board)),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === TugasBoardEntity ? boardRepository : taskRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  } as unknown as DataSource;
  const access = {
    assertTaskMember: jest.fn(() => Promise.resolve({ task, board, member })),
    assertTaskEditor: jest.fn(),
    assertTaskCreator: jest.fn(),
  } as unknown as TugasAccessReader;
  const activity = {
    record: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as TugasActivityService;
  const service = new TugasTaskService(dataSource, access, activity);
  return {
    service,
    task,
    board,
    source,
    target,
    access,
    activity,
    savedTaskBatches,
  };
}

function lockedQuery(result: TugasTaskEntity[]) {
  const query: Record<string, jest.Mock> = {};
  for (const method of [
    'setLock',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.getMany = jest.fn(() => Promise.resolve(result));
  return query;
}

describe('TugasTaskService', () => {
  it('menolak referenceType tanpa referenceId sebelum transaksi dimulai', async () => {
    const harness = createMoveHarness();

    await expect(
      harness.service.create(
        'board-1',
        { judul: 'Task', referenceType: 'naskah_masuk' } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('memindahkan task lintas kolom, menormalisasi urutan, dan mengisi selesaiAt', async () => {
    const harness = createMoveHarness();

    const response = await harness.service.move(
      'moving',
      { status: TugasTaskStatus.DONE, urutan: 1, expectedRevision: 7 },
      actor,
    );

    expect(harness.source.map((task) => task.urutan)).toEqual([0]);
    expect(harness.target.map((task) => `${task.id}:${task.urutan}`)).toEqual([
      'done-a:0',
      'moving:1',
      'done-b:2',
    ]);
    expect(harness.task.selesaiAt).toBeInstanceOf(Date);
    expect(harness.board.revision).toBe(8);
    expect(response.data.revision).toBe(8);
    expect(harness.savedTaskBatches).toHaveLength(1);
    expect(harness.activity.record).toHaveBeenCalledTimes(1);
    expect(harness.access.assertTaskEditor).toHaveBeenCalled();
  });

  it('menghasilkan conflict code stabil sebelum mengubah task saat revision stale', async () => {
    const harness = createMoveHarness(8);

    await expect(
      harness.service.move(
        'moving',
        { status: TugasTaskStatus.DONE, urutan: 0, expectedRevision: 7 },
        actor,
      ),
    ).rejects.toMatchObject<Partial<ConflictException>>({
      response: expect.objectContaining({ code: 'TUGAS_REVISION_CONFLICT' }),
    });
    expect(harness.activity.record).not.toHaveBeenCalled();
  });

  it('menghapus task tetap memakai validasi pembuat, bukan validasi editor', async () => {
    const harness = createMoveHarness();

    await harness.service.remove('moving', actor);

    expect(harness.access.assertTaskCreator).toHaveBeenCalled();
    expect(harness.access.assertTaskEditor).not.toHaveBeenCalled();
  });

  it('menolak archive task yang belum done', async () => {
    const harness = createMoveHarness();

    await expect(
      harness.service.archive('moving', actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.activity.record).not.toHaveBeenCalled();
  });
});
