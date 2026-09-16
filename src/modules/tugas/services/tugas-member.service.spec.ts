/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
import { TugasMemberService } from './tugas-member.service';

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
  boardId: 'board-1',
  persnum: 100,
  positionId: 'POS-1',
  namaSnapshot: 'Pemilik',
  positionTextSnapshot: 'Manager',
  role: TugasBoardMemberRole.OWNER,
} as TugasBoardMemberEntity;

const bersamaBoard = {
  id: 'board-1',
  company: '1000',
  tipe: TugasBoardType.BERSAMA,
  revision: 5,
} as TugasBoardEntity;

const orgSnapshot = {
  tgl: '2026-09-15',
  position_json: [
    {
      position: 200,
      company: 1000,
      position_text: 'Staf Operasi',
      persnum_person: 200,
      persnum_person_text: 'Budi Santoso',
    },
    {
      position: 300,
      company: 1000,
      position_text: 'Analis Data',
      persnum_person: 300,
      persnum_person_text: 'Budi Rahayu',
    },
    {
      position: 400,
      company: 2000,
      position_text: 'Staf Cabang',
      persnum_person: 400,
      persnum_person_text: 'Budi Cabang',
    },
    {
      position: 500,
      company: 1000,
      position_text: 'Posisi Kosong',
      persnum_person: null,
      persnum_person_text: null,
    },
  ],
};

function createOrgDataService() {
  return {
    findLatestPositionSnapshot: jest.fn().mockResolvedValue({ ...orgSnapshot }),
  };
}

function createAccessHarness(board = bersamaBoard, member = ownerMember) {
  return {
    assertBoardOwner: jest.fn(() => Promise.resolve({ board, member })),
    assertBoardMember: jest.fn(() => Promise.resolve({ board, member })),
    repositories: {
      member: {
        find: jest.fn().mockResolvedValue([ownerMember]),
        findOne: jest.fn().mockResolvedValue(null),
      },
    },
  } as unknown as TugasAccessReader;
}

describe('TugasMemberService', () => {
  describe('findCandidates', () => {
    it('menampilkan hanya posisi aktif company board dan exclude member existing', async () => {
      const orgDataService = createOrgDataService();
      const access = createAccessHarness();
      const service = new TugasMemberService(
        {} as DataSource,
        access,
        { record: jest.fn() } as unknown as TugasActivityService,
        orgDataService as never,
      );

      const response = await service.findCandidates(
        'board-1',
        { q: 'budi', page: 1, limit: 10 },
        actor,
      );

      const positionIds = response.data.map((item) => item.positionId);
      // Sort by nama: "Budi Rahayu" (300) sebelum "Budi Santoso" (200).
      expect(positionIds).toEqual(['300', '200']);
      expect(response.data[0]).toMatchObject({
        positionId: '300',
        persnum: 300,
        nama: 'Budi Rahayu',
        positionText: 'Analis Data',
      });
      // Posisi kosong (500) dan company lain (400) tidak boleh muncul.
      expect(positionIds).not.toContain('400');
      expect(positionIds).not.toContain('500');
    });

    it('menolak pencarian pada board personal', async () => {
      const personalBoard = {
        ...bersamaBoard,
        tipe: TugasBoardType.PERSONAL,
      } as TugasBoardEntity;
      const service = new TugasMemberService(
        {} as DataSource,
        createAccessHarness(personalBoard),
        { record: jest.fn() } as unknown as TugasActivityService,
        createOrgDataService() as never,
      );

      await expect(
        service.findCandidates(
          'board-1',
          { q: 'budi', page: 1, limit: 10 },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('menolak query di bawah 2 karakter', async () => {
      const service = new TugasMemberService(
        {} as DataSource,
        createAccessHarness(),
        { record: jest.fn() } as unknown as TugasActivityService,
        createOrgDataService() as never,
      );

      await expect(
        service.findCandidates(
          'board-1',
          { q: 'b', page: 1, limit: 10 },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('add', () => {
    function createAddHarness() {
      const savedMembers: TugasBoardMemberEntity[] = [];
      const memberRepository = {
        create: (value) => value,
        save: jest.fn((value) => {
          savedMembers.push(value);
          return Promise.resolve(value);
        }),
        findOne: jest.fn().mockResolvedValue(null),
      };
      const boardRepository = {
        findOneOrFail: jest.fn(() => Promise.resolve({ ...bersamaBoard })),
        save: jest.fn((value) => Promise.resolve(value)),
      };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === TugasBoardEntity ? boardRepository : memberRepository,
        ),
      };
      const dataSource = {
        transaction: jest.fn((callback) => callback(manager)),
      } as unknown as DataSource;
      const activity = {
        record: jest.fn(() => Promise.resolve(undefined)),
      } as unknown as TugasActivityService;
      const service = new TugasMemberService(
        dataSource,
        createAccessHarness(),
        activity,
        createOrgDataService() as never,
      );
      return { service, activity, savedMembers, boardRepository };
    }

    it('menambah member dengan snapshot dari data organisasi dan increment revision', async () => {
      const harness = createAddHarness();

      const response = await harness.service.add(
        'board-1',
        { positionId: '200' },
        actor,
      );

      expect(harness.savedMembers[0]).toMatchObject({
        boardId: 'board-1',
        positionId: '200',
        persnum: 200,
        namaSnapshot: 'Budi Santoso',
        positionTextSnapshot: 'Staf Operasi',
        role: TugasBoardMemberRole.MEMBER,
      });
      expect(harness.boardRepository.findOneOrFail).toHaveBeenCalled();
      expect(response.data.revision).toBe(6);
      expect(harness.activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          aksi: TugasActivityAction.ADD_MEMBER,
          detail: expect.objectContaining({ nama: 'Budi Santoso' }),
        }),
      );
    });

    it('menolak posisi company lain', async () => {
      const harness = createAddHarness();

      await expect(
        harness.service.add('board-1', { positionId: '400' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(harness.savedMembers).toHaveLength(0);
    });

    it('menolak posisi tanpa pegawai aktif', async () => {
      const harness = createAddHarness();

      await expect(
        harness.service.add('board-1', { positionId: '500' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('menolak duplikat membership posisi', async () => {
      const harness = createAddHarness();
      // Override: posisi 200 sudah terdaftar sebagai member board-1.
      const memberRepository = {
        create: (value) => value,
        save: jest.fn((value) => Promise.resolve(value)),
        findOne: jest.fn().mockResolvedValue({
          id: 'existing-member',
          boardId: 'board-1',
          positionId: '200',
        }),
      };
      const boardRepository = {
        findOneOrFail: jest.fn(() => Promise.resolve({ ...bersamaBoard })),
        save: jest.fn((value) => Promise.resolve(value)),
      };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === TugasBoardEntity ? boardRepository : memberRepository,
        ),
      };
      const dataSource = {
        transaction: jest.fn((callback) => callback(manager)),
      } as unknown as DataSource;
      const service = new TugasMemberService(
        dataSource,
        createAccessHarness(),
        { record: jest.fn() } as unknown as TugasActivityService,
        createOrgDataService() as never,
      );

      await expect(
        service.add('board-1', { positionId: '200' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(harness.savedTasks).toBeUndefined();
    });
  });

  describe('remove', () => {
    function createRemoveHarness() {
      const targetMember = {
        id: 'member-2',
        boardId: 'board-1',
        persnum: 200,
        positionId: 'POS-2',
        namaSnapshot: 'Budi Santoso',
        positionTextSnapshot: 'Staf Operasi',
        role: TugasBoardMemberRole.MEMBER,
      } as TugasBoardMemberEntity;
      const assignedTask = {
        id: 'task-1',
        boardId: 'board-1',
        judul: 'Susun laporan',
        assigneeMemberId: 'member-2',
        updatedByPersnum: null,
      } as TugasTaskEntity;
      const memberQuery = {
        setLock: jest.fn(() => memberQuery),
        where: jest.fn(() => memberQuery),
        andWhere: jest.fn(() => memberQuery),
        getOne: jest.fn(() => Promise.resolve(targetMember)),
      };
      const taskQuery = {
        setLock: jest.fn(() => taskQuery),
        where: jest.fn(() => taskQuery),
        andWhere: jest.fn(() => taskQuery),
        getMany: jest.fn(() => Promise.resolve([assignedTask])),
      };
      const memberRepository = {
        createQueryBuilder: jest.fn(() => memberQuery),
        remove: jest.fn((value) => Promise.resolve(value)),
      };
      const taskRepository = {
        createQueryBuilder: jest.fn(() => taskQuery),
        save: jest.fn((value) => Promise.resolve(value)),
      };
      const boardRepository = {
        findOneOrFail: jest.fn(() => Promise.resolve({ ...bersamaBoard })),
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
      const activity = {
        record: jest.fn(() => Promise.resolve(undefined)),
      } as unknown as TugasActivityService;
      const service = new TugasMemberService(
        dataSource,
        createAccessHarness(),
        activity,
        createOrgDataService() as never,
      );
      return { service, activity, assignedTask, targetMember };
    }

    it('menghapus member, me-null-kan assignment terkait, dan mencatat activity', async () => {
      const harness = createRemoveHarness();

      const response = await harness.service.remove(
        'board-1',
        'member-2',
        actor,
      );

      expect(harness.assignedTask.assigneeMemberId).toBeNull();
      expect(response.data.unassignedTaskCount).toBe(1);
      expect(response.data.revision).toBe(6);
      const recordedActions = harness.activity.record.mock.calls.map(
        (call) => call[1].aksi,
      );
      expect(recordedActions).toContain(TugasActivityAction.UNASSIGN_TASK);
      expect(recordedActions).toContain(TugasActivityAction.REMOVE_MEMBER);
    });

    it('menolak penghapusan owner', async () => {
      const harness = createRemoveHarness();
      // Override: target adalah owner.
      const memberQuery = {
        setLock: jest.fn(() => memberQuery),
        where: jest.fn(() => memberQuery),
        andWhere: jest.fn(() => memberQuery),
        getOne: jest.fn(() => Promise.resolve(ownerMember)),
      };
      const memberRepository = {
        createQueryBuilder: jest.fn(() => memberQuery),
        remove: jest.fn((value) => Promise.resolve(value)),
      };
      const boardRepository = {
        findOneOrFail: jest.fn(() => Promise.resolve({ ...bersamaBoard })),
        save: jest.fn((value) => Promise.resolve(value)),
      };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === TugasBoardEntity ? boardRepository : memberRepository,
        ),
      };
      const dataSource = {
        transaction: jest.fn((callback) => callback(manager)),
      } as unknown as DataSource;
      const service = new TugasMemberService(
        dataSource,
        createAccessHarness(),
        { record: jest.fn() } as unknown as TugasActivityService,
        createOrgDataService() as never,
      );

      await expect(
        service.remove('board-1', 'owner-member', actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      void harness;
    });

    it('menghasilkan 404 ketika member tidak ditemukan', async () => {
      const memberQuery = {
        setLock: jest.fn(() => memberQuery),
        where: jest.fn(() => memberQuery),
        andWhere: jest.fn(() => memberQuery),
        getOne: jest.fn(() => Promise.resolve(null)),
      };
      const memberRepository = {
        createQueryBuilder: jest.fn(() => memberQuery),
        remove: jest.fn((value) => Promise.resolve(value)),
      };
      const boardRepository = {
        findOneOrFail: jest.fn(() => Promise.resolve({ ...bersamaBoard })),
        save: jest.fn((value) => Promise.resolve(value)),
      };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === TugasBoardEntity ? boardRepository : memberRepository,
        ),
      };
      const dataSource = {
        transaction: jest.fn((callback) => callback(manager)),
      } as unknown as DataSource;
      const service = new TugasMemberService(
        dataSource,
        createAccessHarness(),
        { record: jest.fn() } as unknown as TugasActivityService,
        createOrgDataService() as never,
      );

      await expect(
        service.remove('board-1', 'tidak-ada', actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
