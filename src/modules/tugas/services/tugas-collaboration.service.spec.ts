import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
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

const ownerMember = {
  id: 'owner-member',
  role: TugasBoardMemberRole.OWNER,
  namaSnapshot: 'Pemilik',
  positionId: 'POS-1',
} as TugasBoardMemberEntity;

const otherMember = {
  id: 'member-2',
  role: TugasBoardMemberRole.MEMBER,
  namaSnapshot: 'Budi Santoso',
  positionId: 'POS-2',
} as TugasBoardMemberEntity;

const board = { id: 'board-1', revision: 3 } as TugasBoardEntity;

function createAssignHarness() {
  const savedTasks: unknown[] = [];
  const maximumQuery = {
    select: jest.fn(() => maximumQuery),
    where: jest.fn(() => maximumQuery),
    andWhere: jest.fn(() => maximumQuery),
    getRawOne: jest.fn(() => Promise.resolve({ maximum: '1' })),
  };
  const taskRepository = {
    create: (value) => value,
    save: jest.fn((value) => {
      savedTasks.push(value);
      return Promise.resolve(value);
    }),
    createQueryBuilder: jest.fn(() => maximumQuery),
  };
  const boardRepository = {
    findOneOrFail: jest.fn(() => Promise.resolve({ ...board })),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const memberRepository = {
    findOne: jest.fn(({ where }) => {
      if (where?.id === 'member-2' && where?.boardId === 'board-1') {
        return Promise.resolve(otherMember);
      }
      return Promise.resolve(null);
    }),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === TugasBoardEntity) return boardRepository;
      if (entity === TugasBoardMemberEntity) return memberRepository;
      return taskRepository;
    }),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  } as unknown as DataSource;
  const access = {
    assertBoardMember: jest.fn(() =>
      Promise.resolve({ board: { ...board }, member: ownerMember }),
    ),
    assertTaskMember: jest.fn(() =>
      Promise.resolve({
        board: { ...board },
        member: ownerMember,
        task: {
          id: 'task-1',
          boardId: 'board-1',
          judul: 'Task lama',
          assigneeMember: ownerMember,
        } as TugasTaskEntity,
      }),
    ),
    assertTaskEditor: jest.fn(),
    assertTaskCreator: jest.fn(),
  } as unknown as TugasAccessReader;
  const activity = {
    record: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as TugasActivityService;
  const service = new TugasTaskService(dataSource, access, activity);
  return { service, activity, savedTasks, memberRepository };
}

describe('TugasTaskService assignment (Phase 3)', () => {
  it('create dengan assigneeMemberId valid menyimpan assignment dan mencatat activity assign', async () => {
    const harness = createAssignHarness();

    const response = await harness.service.create(
      'board-1',
      {
        judul: 'Task baru',
        assigneeMemberId: 'member-2',
      },
      actor,
    );

    expect(harness.savedTasks[0]).toMatchObject({
      assigneeMemberId: 'member-2',
      createdByMemberId: 'owner-member',
    });
    expect(response.data.assignee).toMatchObject({ id: 'member-2' });
    const actions = harness.activity.record.mock.calls.map(
      (call) => call[1].aksi,
    );
    expect(actions).toContain(TugasActivityAction.CREATE_TASK);
    expect(actions).toContain(TugasActivityAction.ASSIGN_TASK);
  });

  it('create tanpa assigneeMemberId default ke diri sendiri tanpa activity assign', async () => {
    const harness = createAssignHarness();

    const response = await harness.service.create(
      'board-1',
      { judul: 'Task sendiri' },
      actor,
    );

    expect(harness.savedTasks[0]).toMatchObject({
      assigneeMemberId: 'owner-member',
    });
    const actions = harness.activity.record.mock.calls.map(
      (call) => call[1].aksi,
    );
    expect(actions).toContain(TugasActivityAction.CREATE_TASK);
    expect(actions).not.toContain(TugasActivityAction.ASSIGN_TASK);
    expect(response.data.assignee.id).toBe('owner-member');
  });

  it('create dengan assigneeMemberId dari board lain ditolak', async () => {
    const harness = createAssignHarness();

    await expect(
      harness.service.create(
        'board-1',
        { judul: 'Task invalid', assigneeMemberId: 'member-lain' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.savedTasks).toHaveLength(0);
  });

  it('update dengan assigneeMemberId null melepas penugasan dan mencatat unassign', async () => {
    const harness = createAssignHarness();
    const task = {
      id: 'task-1',
      boardId: 'board-1',
      judul: 'Task lama',
      deskripsi: null,
      prioritas: null,
      tenggat: null,
      assigneeMemberId: 'owner-member',
      assigneeMember: ownerMember,
      reminderH1SentAt: null,
      updatedByPersnum: null,
    } as unknown as TugasTaskEntity;
    // Override lockTask agar mengembalikan task dengan assignee owner.
    const taskRepository = {
      findOneOrFail: jest.fn(() => Promise.resolve(task)),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const boardRepository = {
      findOneOrFail: jest.fn(() => Promise.resolve({ ...board })),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const memberRepository = {
      findOne: jest.fn(() => Promise.resolve(null)),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === TugasBoardEntity) return boardRepository;
        if (entity === TugasBoardMemberEntity) return memberRepository;
        return taskRepository;
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    } as unknown as DataSource;
    const service = new TugasTaskService(
      dataSource,
      {
        assertTaskMember: jest.fn(() =>
          Promise.resolve({
            board: { ...board },
            member: ownerMember,
            task: { ...task, assigneeMember: ownerMember },
          }),
        ),
        assertTaskEditor: jest.fn(),
        assertTaskCreator: jest.fn(),
      } as unknown as TugasAccessReader,
      harness.activity,
    );

    const response = await service.update(
      'task-1',
      { assigneeMemberId: null },
      actor,
    );

    expect(task.assigneeMemberId).toBeNull();
    expect(response.data.assignee).toBeNull();
    const actions = harness.activity.record.mock.calls.map(
      (call) => call[1].aksi,
    );
    expect(actions).toContain(TugasActivityAction.UNASSIGN_TASK);
  });
});

describe('TugasBoardService transisi tipe (Phase 3)', () => {
  function createBoardHarness(otherMemberCount: number, assignedCount: number) {
    const boardEntity = {
      id: 'board-1',
      company: '1000',
      nama: 'Papan',
      deskripsi: null,
      tipe: TugasBoardType.BERSAMA,
      warna: '#808080',
      revision: 2,
    } as TugasBoardEntity;
    const memberRepository = {
      count: jest.fn(() => Promise.resolve(otherMemberCount)),
    };
    const taskQuery = {
      where: jest.fn(() => taskQuery),
      andWhere: jest.fn(() => taskQuery),
      getCount: jest.fn(() => Promise.resolve(assignedCount)),
    };
    const taskRepository = {
      createQueryBuilder: jest.fn(() => taskQuery),
    };
    const boardRepository = {
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === TugasBoardEntity) return boardRepository;
        if (entity === TugasTaskEntity) return taskRepository;
        return memberRepository;
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    } as unknown as DataSource;
    const access = {
      assertBoardOwner: jest.fn(() =>
        Promise.resolve({ board: boardEntity, member: ownerMember }),
      ),
    } as unknown as TugasAccessReader;
    const activity = {
      record: jest.fn(() => Promise.resolve(undefined)),
    } as unknown as TugasActivityService;
    const { TugasBoardService } = jest.requireActual('./tugas-board.service');
    const service = new TugasBoardService(dataSource, access, activity);
    return { service, boardEntity };
  }

  it('menolak bersama -> personal ketika masih ada member lain', async () => {
    const harness = createBoardHarness(2, 0);

    await expect(
      harness.service.update(
        'board-1',
        { tipe: TugasBoardType.PERSONAL },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menolak bersama -> personal ketika masih ada task terassign', async () => {
    const harness = createBoardHarness(1, 3);

    await expect(
      harness.service.update(
        'board-1',
        { tipe: TugasBoardType.PERSONAL },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mengizinkan bersama -> personal ketika hanya owner dan tanpa assignment', async () => {
    const harness = createBoardHarness(1, 0);

    const response = await harness.service.update(
      'board-1',
      { tipe: TugasBoardType.PERSONAL },
      actor,
    );

    expect(response.data.tipe).toBe(TugasBoardType.PERSONAL);
    expect(response.data.revision).toBe(3);
  });
});
