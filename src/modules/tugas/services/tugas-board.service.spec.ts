/* eslint-disable @typescript-eslint/unbound-method */
import { DataSource } from 'typeorm';
import { TugasBoardEntity, TugasBoardMemberEntity } from '../entities';
import { TugasBoardType } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasBoardService } from './tugas-board.service';

const actor: TugasActor = {
  persnum: 100,
  nama: 'Pemilik',
  company: '1000',
  position: 'POS-1',
  positionText: 'Manager',
  role: 'user',
};

describe('TugasBoardService', () => {
  it('membuat board dan owner dalam callback transaction yang sama', async () => {
    const boardSave = jest.fn((value) => Promise.resolve(value));
    const memberSave = jest.fn((value) => Promise.resolve(value));
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === TugasBoardEntity) {
          return { create: (value) => value, save: boardSave };
        }
        if (entity === TugasBoardMemberEntity) {
          return { create: (value) => value, save: memberSave };
        }
        throw new Error('Repository tidak dikenal');
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    } as unknown as DataSource;
    const activity = { record: jest.fn() } as unknown as TugasActivityService;
    const service = new TugasBoardService(
      dataSource,
      {} as TugasAccessReader,
      activity,
    );

    const response = await service.create(
      { nama: 'Personal', tipe: TugasBoardType.PERSONAL },
      actor,
    );

    expect(boardSave).toHaveBeenCalledTimes(1);
    expect(memberSave).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: expect.any(String),
        positionId: actor.position,
        persnum: actor.persnum,
        role: 'owner',
      }),
    );
    expect(activity.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ boardId: expect.any(String), actor }),
    );
    expect(response.data.nama).toBe('Personal');
  });

  it('tidak melanjutkan activity ketika owner membership gagal dibuat', async () => {
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === TugasBoardEntity) {
          return {
            create: (value) => value,
            save: (value) => Promise.resolve(value),
          };
        }
        return {
          create: (value) => value,
          save: () => Promise.reject(new Error('member gagal')),
        };
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    } as unknown as DataSource;
    const activity = { record: jest.fn() } as unknown as TugasActivityService;
    const service = new TugasBoardService(
      dataSource,
      {} as TugasAccessReader,
      activity,
    );

    await expect(service.create({ nama: 'Gagal' }, actor)).rejects.toThrow(
      'member gagal',
    );
    expect(activity.record).not.toHaveBeenCalled();
  });
});
