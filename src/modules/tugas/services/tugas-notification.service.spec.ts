/* eslint-disable @typescript-eslint/unbound-method */
import { Repository } from 'typeorm';
import { NotificationService } from '../../notification/services/notification.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { TugasBoardEntity, TugasTaskEntity } from '../entities';
import { TugasActor } from '../tugas.types';
import { TugasNotificationService } from './tugas-notification.service';

const actor: TugasActor = {
  persnum: 100,
  nama: 'Pemilik',
  company: '1000',
  position: 'POS-1',
  positionText: 'Manager',
  role: 'user',
};

const board = { id: 'board-1', nama: 'Papan Uji' } as TugasBoardEntity;
const task = { id: 'task-1', judul: 'Task Uji' } as TugasTaskEntity;

describe('TugasNotificationService (Phase 6)', () => {
  function createService() {
    const taskRepository = {
      createQueryBuilder: jest.fn(() => ({
        innerJoin: jest.fn(() => query),
        innerJoinAndSelect: jest.fn(() => query),
        where: jest.fn(() => query),
        andWhere: jest.fn(() => query),
        getMany: jest.fn(() => Promise.resolve([])),
        getCount: jest.fn(() => Promise.resolve(2)),
        update: jest.fn(() => query),
        set: jest.fn(() => query),
        execute: jest.fn(() => Promise.resolve({ affected: 1 })),
      })),
    };
    const query: Record<string, jest.Mock> =
      taskRepository.createQueryBuilder();
    const notificationService = {
      createNotification: jest.fn(() => Promise.resolve({ id: 'n-1' })),
    } as unknown as NotificationService;
    const realtimeEmitService = {
      emitTugasBoardUpdated: jest.fn(),
      emitTugasTaskUpdated: jest.fn(),
      emitTugasAssignedCount: jest.fn(),
    } as unknown as RealtimeEmitService;
    const service = new TugasNotificationService(
      taskRepository as unknown as Repository<TugasTaskEntity>,
      notificationService,
      realtimeEmitService,
    );
    return {
      service,
      notificationService,
      realtimeEmitService,
      taskRepository,
    };
  }

  it('tidak mengirim notifikasi assign ke actor sendiri', async () => {
    const harness = createService();

    await harness.service.notifyAssigned({
      board,
      task,
      assigneePositionId: actor.position,
      assigneePersnum: actor.persnum,
      actor,
    });

    expect(
      harness.notificationService.createNotification,
    ).not.toHaveBeenCalled();
  });

  it('mengirim notifikasi assign dengan payload OPEN_TUGAS_TASK', async () => {
    const harness = createService();

    await harness.service.notifyAssigned({
      board,
      task,
      assigneePositionId: 'POS-2',
      assigneePersnum: 200,
      actor,
    });

    expect(harness.notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'POS-2',
        userPersnum: 200,
        type: 'TUGAS_ASSIGNED',
        data: expect.objectContaining({
          action: 'OPEN_TUGAS_TASK',
          boardId: board.id,
          taskId: task.id,
        }),
      }),
      true,
    );
  });

  it('mengirim notifikasi member-added tanpa taskId', async () => {
    const harness = createService();

    await harness.service.notifyMemberAdded({
      board,
      memberPositionId: 'POS-2',
      memberPersnum: 200,
      actor,
    });

    expect(harness.notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'POS-2',
        type: 'TUGAS_MEMBER_ADDED',
        data: expect.objectContaining({ boardId: board.id, taskId: null }),
      }),
      true,
    );
  });

  it('mengirim notifikasi done ke assignee bukan actor', async () => {
    const harness = createService();

    await harness.service.notifyDone({
      board,
      task,
      assigneePositionId: 'POS-2',
      assigneePersnum: 200,
      actor,
    });

    expect(harness.notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TUGAS_DONE' }),
      true,
    );
  });

  it('emitBoardUpdatedSafe meneruskan payload ringkas ke emit service', () => {
    const harness = createService();

    harness.service.emitBoardUpdatedSafe({
      boardId: board.id,
      revision: 7,
      action: 'move_task',
      taskId: task.id,
      actor,
    });

    expect(
      harness.realtimeEmitService.emitTugasBoardUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: board.id,
        revision: 7,
        action: 'move_task',
        taskId: task.id,
        actor: { persnum: actor.persnum, nama: actor.nama },
      }),
    );
    expect(
      harness.realtimeEmitService.emitTugasTaskUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: board.id,
        taskId: task.id,
        revision: 7,
        action: 'move_task',
      }),
    );
  });

  it('mempertahankan claim reminder ketika notifikasi berhasil dipersist', async () => {
    const harness = createService();
    const query = harness.taskRepository
      .createQueryBuilder()
      .innerJoinAndSelect();
    harness.taskRepository.createQueryBuilder.mockReturnValue(query);
    query.getMany.mockResolvedValue([
      {
        id: task.id,
        boardId: board.id,
        judul: task.judul,
        tenggat: '2026-09-16',
        board,
        assigneeMember: { positionId: 'POS-2', persnum: 200 },
      },
    ]);

    await harness.service.sendDueReminders();

    expect(harness.notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TUGAS_DUE' }),
      true,
      true,
    );
    expect(query.execute).toHaveBeenCalledTimes(1);
  });

  it('mereset claim reminder hanya ketika persist notifikasi gagal', async () => {
    const harness = createService();
    const query = harness.taskRepository
      .createQueryBuilder()
      .innerJoinAndSelect();
    harness.taskRepository.createQueryBuilder.mockReturnValue(query);
    query.getMany.mockResolvedValue([
      {
        id: task.id,
        boardId: board.id,
        judul: task.judul,
        tenggat: '2026-09-16',
        board,
        assigneeMember: { positionId: 'POS-2', persnum: 200 },
      },
    ]);
    (
      harness.notificationService.createNotification as jest.Mock
    ).mockRejectedValueOnce(new Error('database unavailable'));

    await harness.service.sendDueReminders();

    expect(query.execute).toHaveBeenCalledTimes(2);
    expect(query.set).toHaveBeenLastCalledWith({ reminderH1SentAt: null });
  });

  it('emitAssignedCount menghitung lalu emit ke room posisi', async () => {
    const harness = createService();

    await harness.service.emitAssignedCount('POS-2', '1000');

    expect(
      harness.realtimeEmitService.emitTugasAssignedCount,
    ).toHaveBeenCalledWith('POS-2', 2);
  });
});
