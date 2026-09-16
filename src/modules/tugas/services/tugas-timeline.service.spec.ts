/* eslint-disable @typescript-eslint/unbound-method */
import { TugasActivityEntity } from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasTimelineService } from './tugas-timeline.service';

const actor: TugasActor = {
  persnum: 100,
  nama: 'Pemilik',
  company: '1000',
  position: 'POS-1',
  positionText: 'Manager',
  role: 'user',
};

const makeActivity = (
  id: string,
  aksi: TugasActivityAction,
  taskId: string | null,
): TugasActivityEntity =>
  ({
    id,
    boardId: 'board-1',
    taskId,
    aksi,
    detail: { judul: 'Task A' },
    actorPersnum: 100,
    actorPositionId: 'POS-1',
    createdAt: new Date(),
  }) as TugasActivityEntity;

describe('TugasTimelineService', () => {
  it('memetakan activity board dengan pagination dan tetap menampilkan task terhapus', async () => {
    const activities = [
      makeActivity('a-1', TugasActivityAction.DELETE_TASK, null),
      makeActivity('a-2', TugasActivityAction.MOVE_TASK, 'task-1'),
      makeActivity('a-3', TugasActivityAction.ADD_MEMBER, null),
    ];
    const query = {
      setWhere: undefined,
      where: jest.fn(() => query),
      andWhere: jest.fn(() => query),
      orderBy: jest.fn(() => query),
      addOrderBy: jest.fn(() => query),
      skip: jest.fn(() => query),
      take: jest.fn(() => query),
      getManyAndCount: jest.fn(() => Promise.resolve([activities, 3])),
    };
    const activityRepository = {
      createQueryBuilder: jest.fn(() => query),
    };
    const access = {
      assertBoardMember: jest.fn(() => Promise.resolve({})),
      repositories: { activity: activityRepository },
    } as unknown as TugasAccessReader;
    const service = new TugasTimelineService(access);

    const response = await service.findTimeline(
      'board-1',
      { page: 1, limit: 20 },
      actor,
    );

    expect(access.assertBoardMember).toHaveBeenCalledWith(
      'board-1',
      actor.company,
      actor.position,
    );
    expect(response.data).toHaveLength(3);
    expect(response.data[0]).toMatchObject({
      id: 'a-1',
      taskId: null,
      aksi: TugasActivityAction.DELETE_TASK,
    });
    expect(response.meta).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
  });
});
