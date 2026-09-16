import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
} from '../entities';
import { TugasBoardMemberRole } from '../enums';
import { TugasAccessReader } from './tugas-access.reader';

function repositoryWithResult<T>(result: T | null) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ['innerJoinAndSelect', 'where', 'andWhere']) {
    query[method] = jest.fn(() => query);
  }
  query.getOne = jest.fn(() => Promise.resolve(result));
  return {
    createQueryBuilder: jest.fn(() => query),
    query,
  };
}

describe('TugasAccessReader', () => {
  it('mengembalikan 404 untuk posisi/company tanpa membership', async () => {
    const memberRepository = repositoryWithResult(null);
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      memberRepository as unknown as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    await expect(
      reader.assertBoardMember('board', 'COMPANY-B', 'POSITION-B'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(memberRepository.query.andWhere).toHaveBeenCalledWith(
      'board.company = :company',
      { company: 'COMPANY-B' },
    );
    expect(memberRepository.query.andWhere).toHaveBeenCalledWith(
      'board.deleted_at IS NULL',
    );
  });

  it('mengembalikan 403 ketika member menjalankan aksi owner-only', async () => {
    const memberRepository = repositoryWithResult({
      role: TugasBoardMemberRole.MEMBER,
      board: { id: 'board' },
    });
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      memberRepository as unknown as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    await expect(
      reader.assertBoardOwner('board', 'COMPANY-A', 'POSITION-A'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menolak mutasi task milik anggota lain termasuk oleh owner papan', () => {
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      {} as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    expect(() =>
      reader.assertTaskCreator({
        board: { id: 'board' } as TugasBoardEntity,
        member: {
          id: 'owner-member',
          persnum: 100,
          role: TugasBoardMemberRole.OWNER,
        } as TugasBoardMemberEntity,
        task: {
          createdByMemberId: 'other-member',
          createdByPersnum: 200,
        } as TugasTaskEntity,
      }),
    ).toThrow(ForbiddenException);
  });

  it('mengizinkan pembuat task melalui fallback persnum untuk data lama', () => {
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      {} as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    expect(() =>
      reader.assertTaskCreator({
        board: { id: 'board' } as TugasBoardEntity,
        member: { id: 'member', persnum: 100 } as TugasBoardMemberEntity,
        task: {
          createdByMemberId: null,
          createdByPersnum: 100,
        } as TugasTaskEntity,
      }),
    ).not.toThrow();
  });

  it('mengizinkan PIC aktif mengedit task milik anggota lain', () => {
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      {} as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    expect(() =>
      reader.assertTaskEditor({
        board: { id: 'board' } as TugasBoardEntity,
        member: { id: 'pic-member', persnum: 300 } as TugasBoardMemberEntity,
        task: {
          createdByMemberId: 'creator-member',
          createdByPersnum: 200,
          assigneeMemberId: 'pic-member',
        } as TugasTaskEntity,
      }),
    ).not.toThrow();
  });

  it('menolak anggota yang bukan pembuat maupun PIC untuk mengedit task', () => {
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      {} as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    expect(() =>
      reader.assertTaskEditor({
        board: { id: 'board' } as TugasBoardEntity,
        member: { id: 'other-member', persnum: 400 } as TugasBoardMemberEntity,
        task: {
          createdByMemberId: 'creator-member',
          createdByPersnum: 200,
          assigneeMemberId: 'pic-member',
        } as TugasTaskEntity,
      }),
    ).toThrow(ForbiddenException);
  });

  it('tetap melarang PIC menghapus task ketika bukan pembuatnya', () => {
    const reader = new TugasAccessReader(
      {} as Repository<TugasBoardEntity>,
      {} as Repository<TugasBoardMemberEntity>,
      {} as Repository<TugasTaskEntity>,
    );

    expect(() =>
      reader.assertTaskCreator({
        board: { id: 'board' } as TugasBoardEntity,
        member: { id: 'pic-member', persnum: 300 } as TugasBoardMemberEntity,
        task: {
          createdByMemberId: 'creator-member',
          createdByPersnum: 200,
          assigneeMemberId: 'pic-member',
        } as TugasTaskEntity,
      }),
    ).toThrow(ForbiddenException);
  });
});
