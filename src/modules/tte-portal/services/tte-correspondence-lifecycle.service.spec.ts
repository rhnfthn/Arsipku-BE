import { DataSource, EntityManager } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import { TteCorrespondenceLifecycleService } from './tte-correspondence-lifecycle.service';

function setup(status: string) {
  const document = {
    id: 'document',
    tanggal: new Date(),
    status: 'pending_tte',
    nomor: '001/TNG/X/2026',
  };
  const transaction = {
    id: 'transaction',
    idNaskah: document.id,
    jenisNaskah: 'ND',
    nomorNaskah: document.nomor,
    status,
  } as TteSigningTransactionEntity;
  const naskah = {
    findOne: jest.fn().mockResolvedValue(document),
    update: jest
      .fn()
      .mockImplementation(
        (_where: unknown, patch: Partial<typeof document>) => {
          Object.assign(document, patch);
          return Promise.resolve();
        },
      ),
  };
  const transactions = { findOne: jest.fn().mockResolvedValue(transaction) };
  const numbers = { update: jest.fn().mockResolvedValue(undefined) };
  const circulation = { update: jest.fn().mockResolvedValue(undefined) };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === NaskahEntity) return naskah;
      if (entity === TteSigningTransactionEntity) return transactions;
      if (entity === NomorRequestDetailEntity) return numbers;
      if (entity === NaskahSirkulasi) return circulation;
      throw new Error('Unexpected entity');
    }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: (work: (manager: EntityManager) => Promise<void>) =>
      work(manager),
  } as DataSource;
  return {
    service: new TteCorrespondenceLifecycleService(dataSource),
    transaction,
    document,
    naskah,
    transactions,
    numbers,
    circulation,
  };
}

describe('Pending correspondence lifecycle', () => {
  it.each(['CANCELLED', 'EXPIRED', 'FAILED'])(
    'restores %s to an editable draft without deleting content',
    async (status) => {
      const state = setup(status);
      await state.service.reconcile(state.transaction);
      expect(state.numbers.update).toHaveBeenCalledWith(
        expect.objectContaining({ nomor: '001/TNG/X/2026' }),
        { status: 'hangus' },
      );
      expect(state.naskah.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'document' }),
        expect.objectContaining({
          status: 'draf',
          nomor: null,
          tandaTangan: null,
        }),
      );
      expect(state.circulation.update).toHaveBeenCalledWith(
        { idNaskah: 'document' },
        { isDraft: true },
      );
      await state.service.reconcile(state.transaction);
      expect(state.naskah.update).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['PENDING', 'OPENED', 'PROCESSING', 'RECONCILING', 'PARTIAL'])(
    'keeps %s locked and its number reserved',
    async (status) => {
      const state = setup(status);
      await state.service.reconcile(state.transaction);
      expect(state.naskah.update).not.toHaveBeenCalled();
      expect(state.numbers.update).toHaveBeenCalledWith(
        { nomor: '001/TNG/X/2026', status: 'terpakai_final' },
        { status: 'booking' },
      );
    },
  );

  it('ignores a terminal result from an older signing attempt', async () => {
    const state = setup('EXPIRED');
    state.transactions.findOne.mockResolvedValue({
      ...state.transaction,
      id: 'new-attempt',
    });
    await state.service.reconcile(state.transaction);
    expect(state.naskah.update).not.toHaveBeenCalled();
    expect(state.numbers.update).not.toHaveBeenCalled();
  });

  it.each([
    'signedAt',
    'signedFilePath',
    'completedAt',
    'completionProcessing',
  ])('does not clear a failed request with %s evidence', async (field) => {
    const state = setup('FAILED');
    Object.assign(state.transaction, { [field]: true });
    await state.service.reconcile(state.transaction);
    expect(state.naskah.update).not.toHaveBeenCalled();
  });

  it('keeps an ambiguous request creation failure for reconciliation', async () => {
    const state = setup('FAILED');
    Object.assign(state.transaction, {
      errorCode: 'PREPARATION_FAILED',
      uploadStatus: 'VERIFIED',
    });
    await state.service.reconcile(state.transaction);
    expect(state.naskah.update).not.toHaveBeenCalled();
  });

  it('marks the reservation official only after signed PDF completion', async () => {
    const state = setup('SIGNED');
    await state.service.reconcile(state.transaction);
    expect(state.numbers.update).not.toHaveBeenCalled();
    state.document.status = 'final_tte';
    state.transaction.completedAt = new Date();
    await state.service.reconcile(state.transaction);
    expect(state.numbers.update).toHaveBeenCalledWith(
      { nomor: '001/TNG/X/2026', status: 'booking' },
      { status: 'terpakai_final' },
    );
  });
  it('does not clear a newly reserved attempt before its transaction is persisted', async () => {
    const state = setup('EXPIRED');
    state.document.nomor = '002/TNG/X/2026';
    await state.service.reconcile(state.transaction);
    expect(state.naskah.update).not.toHaveBeenCalled();
    expect(state.numbers.update).not.toHaveBeenCalled();
  });
});
