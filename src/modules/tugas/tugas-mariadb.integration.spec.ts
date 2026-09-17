import 'reflect-metadata';
import {
  ConflictException,
  ExecutionContext,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TugasController } from './controllers';
import {
  TugasActivityEntity,
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
  TugasTaskReferenceEntity,
} from './entities';
import { TugasBoardFilter, TugasMyTaskScope, TugasTaskStatus } from './enums';
import { CreateTugas1789800000000 } from './migrations/1789800000000-CreateTugas';
import {
  TugasAccessReader,
  TugasActivityService,
  TugasBoardService,
  TugasTaskService,
} from './services';
import { TugasActor } from './tugas.types';

const databaseUrl = process.env.TUGAS_TEST_DB_URL;
const describeMariaDb = databaseUrl ? describe : describe.skip;

describeMariaDb('Tugas Phase 2 MariaDB integration', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let boardService: TugasBoardService;
  let taskService: TugasTaskService;

  const actor: TugasActor = {
    persnum: 100,
    nama: 'Pemilik',
    company: '1000',
    position: 'POSITION-OWNER',
    positionText: 'Manager',
    role: 'user',
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mariadb',
      url: databaseUrl,
      entities: [
        TugasBoardEntity,
        TugasBoardMemberEntity,
        TugasTaskEntity,
        TugasTaskReferenceEntity,
        TugasActivityEntity,
      ],
      migrations: [CreateTugas1789800000000],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'all' });
    const access = new TugasAccessReader(
      dataSource.getRepository(TugasBoardEntity),
      dataSource.getRepository(TugasBoardMemberEntity),
      dataSource.getRepository(TugasTaskEntity),
    );
    const activity = new TugasActivityService();
    boardService = new TugasBoardService(dataSource, access, activity);
    taskService = new TugasTaskService(dataSource, access, activity);
    const testingModule = await Test.createTestingModule({
      controllers: [TugasController],
      providers: [
        { provide: TugasBoardService, useValue: boardService },
        { provide: TugasTaskService, useValue: taskService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = actor;
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = testingModule.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) {
      await dataSource.dropDatabase();
      await dataSource.destroy();
    }
  });

  it('menyediakan REST create board, create task, dan Tugas Saya tervalidasi', async () => {
    const createBoardResponse = await request(app.getHttpServer())
      .post('/tugas/boards')
      .send({ nama: '  Papan REST  ', warna: '#2563eb' })
      .expect(201);
    expect(createBoardResponse.body.data.nama).toBe('Papan REST');
    expect(createBoardResponse.body.data.warna).toBe('#2563EB');

    await request(app.getHttpServer())
      .post(`/tugas/boards/${createBoardResponse.body.data.id}/tasks`)
      .send({ judul: 'Task dari REST', tenggat: todayInJakarta() })
      .expect(201);

    const myTasksResponse = await request(app.getHttpServer())
      .get('/tugas/my-tasks?scope=hari-ini&page=1&limit=20')
      .expect(200);
    expect(myTasksResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ judul: 'Task dari REST' }),
      ]),
    );

    await request(app.getHttpServer())
      .post('/tugas/boards')
      .send({ nama: 'Invalid', fieldAsing: true })
      .expect(400);
  });

  it('menjalankan create board hingga task tampil di Tugas Saya', async () => {
    const createdBoard = await boardService.create(
      { nama: 'Papan Integrasi', warna: '#3B82F6' },
      actor,
    );
    const boardId = createdBoard.data.id;
    const boardList = await boardService.findAll(
      { filter: TugasBoardFilter.SEMUA, page: 1, limit: 20 },
      actor,
    );
    expect(boardList.data.map((board) => board.id)).toContain(boardId);

    const first = await taskService.create(
      boardId,
      { judul: 'Task hari ini', tenggat: todayInJakarta() },
      actor,
    );
    const second = await taskService.create(
      boardId,
      { judul: 'Task kedua' },
      actor,
    );
    expect(first.data.urutan).toBe(0);
    expect(second.data.urutan).toBe(1);

    const myTasks = await taskService.findMyTasks(
      {
        page: 1,
        limit: 20,
        includeArchived: false,
        scope: TugasMyTaskScope.SEMUA,
        boardId,
      },
      actor,
    );
    expect(myTasks.data).toHaveLength(2);
    expect(myTasks.counts.hariIni).toBe(1);

    const moved = await taskService.move(
      first.data.id,
      {
        status: TugasTaskStatus.DONE,
        urutan: 0,
        expectedRevision: second.data.revision,
      },
      actor,
    );
    expect(moved.data.selesaiAt).toBeInstanceOf(Date);

    await expect(
      taskService.move(
        second.data.id,
        {
          status: TugasTaskStatus.DONE,
          urutan: 1,
          expectedRevision: second.data.revision,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const archived = await taskService.archive(first.data.id, actor);
    const tasks = await taskService.findAll(
      boardId,
      { page: 1, limit: 20, includeArchived: false },
      actor,
    );
    expect(tasks.data.map((task) => task.id)).not.toContain(first.data.id);

    const unarchived = await taskService.unarchive(first.data.id, actor);
    const reopened = await taskService.move(
      first.data.id,
      {
        status: TugasTaskStatus.TODO,
        urutan: 1,
        expectedRevision: unarchived.data.revision,
      },
      actor,
    );
    expect(reopened.data.selesaiAt).toBeNull();
    const updatedTask = await taskService.update(
      first.data.id,
      { judul: 'Task diperbarui', tenggat: null },
      actor,
    );
    expect(updatedTask.data.judul).toBe('Task diperbarui');
    expect(updatedTask.data.tenggat).toBeNull();

    await taskService.remove(second.data.id, actor);
    const remaining = await taskService.findAll(
      boardId,
      { page: 1, limit: 20, includeArchived: false },
      actor,
    );
    expect(remaining.data.map((task) => `${task.id}:${task.urutan}`)).toEqual([
      `${first.data.id}:0`,
    ]);

    await expect(
      boardService.findOne(boardId, {
        ...actor,
        position: 'POSITION-NON-MEMBER',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      boardService.findOne(boardId, { ...actor, company: 'COMPANY-LAIN' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const updatedBoard = await boardService.update(
      boardId,
      { nama: 'Papan Diperbarui' },
      actor,
    );
    expect(updatedBoard.data.nama).toBe('Papan Diperbarui');
    await boardService.remove(boardId, actor);
    await expect(boardService.findOne(boardId, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const restoredBoard = await boardService.restore(boardId, actor);
    expect(restoredBoard.data.nama).toBe('Papan Diperbarui');
    expect(restoredBoard.data.revision).toBeGreaterThan(archived.data.revision);
  });
});

function todayInJakarta(): string {
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
