import { InternalServerErrorException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import { TteCompletionDispatcher } from './tte-completion-dispatcher.service';
import type { TteCompletionHandler } from './tte-signing.service';

describe('TteCompletionDispatcher', () => {
  const signedFilePath = 'tte/signed.pdf';

  const transaction = (jenisNaskah: string) =>
    ({ id: 'tx-1', jenisNaskah }) as TteSigningTransactionEntity;

  it.each([
    ['ND', 'NotaDinasTteCompletionHandler'],
    ['SDI', 'PortalNaskahTteCompletionHandler'],
    ['SDE', 'PortalNaskahTteCompletionHandler'],
    ['DI', 'PortalNaskahTteCompletionHandler'],
    ['KA', 'PortalNaskahTteCompletionHandler'],
    ['SDE_MASAL', 'SdeMasalTteCompletionHandler'],
    ['UND', 'NaskahUmumTteCompletionHandler'],
    ['LPD', 'NaskahLainnyaTteCompletionHandler'],
  ])('mengarahkan %s ke handler yang benar', async (jenis, token) => {
    const completeSigning = jest.fn().mockResolvedValue(undefined);
    const handler: TteCompletionHandler = {
      completeSigning,
    };
    const moduleRef = {
      get: jest.fn((requestedToken: string) =>
        requestedToken === token ? handler : null,
      ),
    } as unknown as ModuleRef;
    const dispatcher = new TteCompletionDispatcher(moduleRef);

    await dispatcher.completeSigning(transaction(jenis), signedFilePath);

    expect(completeSigning).toHaveBeenCalledWith(
      expect.objectContaining({ jenisNaskah: jenis }),
      signedFilePath,
    );
  });

  it('gagal eksplisit bila handler tidak tersedia', async () => {
    const moduleRef = { get: jest.fn(() => null) } as unknown as ModuleRef;
    const dispatcher = new TteCompletionDispatcher(moduleRef);

    await expect(
      dispatcher.completeSigning(transaction('ND'), signedFilePath),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
