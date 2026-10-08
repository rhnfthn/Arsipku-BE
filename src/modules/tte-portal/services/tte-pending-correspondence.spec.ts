import {
  TteSigningService,
  TteTransactionStatusResult,
} from './tte-signing.service';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';

type Dependencies = ConstructorParameters<typeof TteSigningService>;
function setup(status = 'PENDING') {
  const transaction = {
    id: 'transaction',
    idNaskah: 'document',
    userPersnum: 1,
    status,
    signingUrl: 'https://portal.test/sign',
    expiresAt: new Date(Date.now() + 60000),
  } as TteSigningTransactionEntity;
  const repository = {
    findOne: jest.fn().mockResolvedValue(transaction),
    findOneOrFail: jest.fn().mockResolvedValue(transaction),
    update: jest.fn(),
  };
  const lifecycle = { canReadPending: jest.fn().mockResolvedValue(false) };
  const service = new TteSigningService(
    {} as Dependencies[0],
    {} as Dependencies[1],
    {} as Dependencies[2],
    {} as Dependencies[3],
    repository as unknown as Dependencies[4],
    {} as Dependencies[5],
    lifecycle as unknown as Dependencies[6],
  );
  const polling = jest
    .spyOn(service, 'getTransactionStatus')
    .mockImplementation(() =>
      Promise.resolve({
        ...transaction,
      } as unknown as TteTransactionStatusResult),
    );
  return { service, transaction, repository, lifecycle, polling };
}

describe('Pending correspondence actions', () => {
  it('resumes the existing live signing request without creating a new one', async () => {
    const state = setup();
    const result = await state.service.getPendingCorrespondence('document', 1);
    expect(result.signingUrl).toBe('https://portal.test/sign');
    expect(state.repository.update).not.toHaveBeenCalled();
  });
  it.each(['PROCESSING', 'RECONCILING', 'SIGNED', 'PARTIAL', 'EXPIRED'])(
    'does not return a signing URL for %s',
    async (status) => {
      expect(
        (await setup(status).service.getPendingCorrespondence('document', 1))
          .signingUrl,
      ).toBeNull();
    },
  );
  it('does not reveal signing status to an unrelated user', async () => {
    const state = setup();
    await expect(
      state.service.getPendingCorrespondence('document', 2, '99'),
    ).rejects.toThrow('Transaksi signing tidak ditemukan');
    expect(state.polling).not.toHaveBeenCalled();
  });
  it('allows a draft owner to check status without exposing the signer URL', async () => {
    const state = setup();
    state.lifecycle.canReadPending.mockResolvedValue(true);
    const result = await state.service.getPendingCorrespondence(
      'document',
      2,
      '99',
    );
    expect(result.signingUrl).toBeNull();
    expect(state.polling).toHaveBeenCalledWith('transaction', 1);
  });
  it.each(['PROCESSING', 'RECONCILING'])(
    'never resets %s based on local expiry',
    async (status) => {
      const state = setup(status);
      state.transaction.expiresAt = new Date(0);
      await expect(
        state.service.resolvePendingTteForRefinalize('document', 1),
      ).rejects.toThrow('Transaksi TTE belum dapat diulang');
      expect(state.repository.update).not.toHaveBeenCalled();
    },
  );
  it('does not restart a pending document without an identified signing transaction', async () => {
    const state = setup();
    state.repository.findOne.mockResolvedValue(null);
    await expect(
      state.service.resolvePendingTteForRefinalize('document', 1),
    ).rejects.toThrow('Transaksi TTE belum teridentifikasi');
    expect(state.repository.update).not.toHaveBeenCalled();
  });
});
