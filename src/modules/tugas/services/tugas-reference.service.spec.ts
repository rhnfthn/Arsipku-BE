import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TugasBoardEntity, TugasTaskEntity } from '../entities';
import { TugasBoardType, TugasReferenceType } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasReferenceResolver } from './tugas-reference-resolver.service';
import { TugasReferenceService } from './tugas-reference.service';

const actor = {
  company: '1000',
  position: 'POS-1',
  persnum: 100,
} as TugasActor;
function harness(tipe: TugasBoardType) {
  const board = { id: 'board', tipe, revision: 0 };
  const references = {
    findOne: jest.fn(() => Promise.resolve(null)),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === TugasBoardEntity
        ? {
            findOneOrFail: jest.fn(() => Promise.resolve(board)),
            save: jest.fn(),
          }
        : entity === TugasTaskEntity
          ? {
              findOneOrFail: jest.fn(() =>
                Promise.resolve({ id: 'task', judul: 'Task' }),
              ),
            }
          : references,
    ),
  };
  const transaction = jest.fn((run) => run(manager));
  const access = {
    assertTaskMember: jest.fn(() => Promise.resolve({ board })),
    assertTaskEditor: jest.fn(),
  } as unknown as TugasAccessReader;
  const resolver = {
    resolveByNumber: jest.fn(() =>
      Promise.resolve({
        referenceType: TugasReferenceType.NASKAH_MASUK,
        referenceId: 'document',
        labelSnapshot: 'ND/123 — Naskah',
        route: '/korespondensi/kotak-masuk/document',
      }),
    ),
  };
  const service = new TugasReferenceService(
    { transaction } as unknown as DataSource,
    access,
    { record: jest.fn() } as never,
    resolver as unknown as TugasReferenceResolver,
    { emitBoardUpdatedSafe: jest.fn() } as never,
  );
  return { service, transaction, resolver, references };
}

describe('Tugas reference by document number', () => {
  it.each([TugasBoardType.PERSONAL, TugasBoardType.BERSAMA])(
    'menerima nomor pada %s dan menyimpan ID/label hasil resolver',
    async (tipe) => {
      const { service, resolver, references } = harness(tipe);
      await service.add(
        'task',
        {
          referenceType: TugasReferenceType.NASKAH_MASUK,
          referenceNumber: 'ND/123',
        },
        actor,
      );
      expect(resolver.resolveByNumber).toHaveBeenCalledWith(
        TugasReferenceType.NASKAH_MASUK,
        'ND/123',
        actor,
      );
      expect(references.save).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'document',
          labelSnapshot: 'ND/123 — Naskah',
        }),
      );
    },
  );
  it('tidak menyimpan referensi ketika nomor tidak dapat diakses', async () => {
    const { service, resolver, references } = harness(TugasBoardType.PERSONAL);
    resolver.resolveByNumber.mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.add(
        'task',
        {
          referenceType: TugasReferenceType.NASKAH_MASUK,
          referenceNumber: 'ND/123',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(references.save).not.toHaveBeenCalled();
  });
  it('menolak sumber selain Kotak Masuk/Terkirim', async () => {
    const { service, transaction } = harness(TugasBoardType.PERSONAL);
    await expect(
      service.add(
        'task',
        {
          referenceType: TugasReferenceType.NASKAH_LAINNYA,
          referenceNumber: 'PER/123',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
