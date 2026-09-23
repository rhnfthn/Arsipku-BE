import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TteCompletionHandler } from './tte-signing.service';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';

/**
 * Composite dispatcher completion handler.
 *
 * Memilih handler berdasarkan jenis naskah transaksi:
 * - Nota Dinas (ND) → NotaDinasTteCompletionHandler
 * - Naskah Umum (jenis template: UND, PER, KEP, dll) → NaskahUmumTteCompletionHandler
 * - Naskah Lainnya (LPD, BV, dll) → NaskahLainnyaTteCompletionHandler
 *
 * Handler di-resolve lazy via ModuleRef agar tidak circular dependency:
 * tte-portal tidak perlu import module naskah (yang import tte-portal balik).
 */
@Injectable()
export class TteCompletionDispatcher implements TteCompletionHandler {
  private readonly logger = new Logger(TteCompletionDispatcher.name);

  /** Jenis template naskah umum (map ke NU) */
  private static readonly NU_TEMPLATES = new Set([
    'UND',
    'PER',
    'KEP',
    'INS',
    'SPR',
    'EDR',
    'SOP',
    'MOU',
    'PKS',
    'PROC',
    'PJJ',
    'LOA',
    'SKU',
    'BAC',
    'KET',
    'SPE',
    'RPT',
    'PEN',
    'PGM',
    'LAP',
    'K',
  ]);

  constructor(private readonly moduleRef: ModuleRef) {}

  async completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void> {
    const jenis = transaction.jenisNaskah?.toUpperCase() ?? '';

    let handler: TteCompletionHandler | null = null;
    if (jenis === 'ND') {
      handler = this.resolveHandler('NotaDinasTteCompletionHandler');
    } else if (jenis === 'SDE_MASAL') {
      handler = this.resolveHandler('SdeMasalTteCompletionHandler');
    } else if (['SDI', 'SDE', 'DI', 'KA'].includes(jenis)) {
      handler = this.resolveHandler('PortalNaskahTteCompletionHandler');
    } else if (TteCompletionDispatcher.NU_TEMPLATES.has(jenis)) {
      handler = this.resolveHandler('NaskahUmumTteCompletionHandler');
    } else {
      // Naskah lainnya (LPD, BV, dll) — semua jenis non-NU-template
      handler = this.resolveHandler('NaskahLainnyaTteCompletionHandler');
    }

    if (!handler) {
      const message = `Completion handler tidak tersedia utk jenis ${jenis} — transaksi ${transaction.id} belum boleh dianggap selesai`;
      this.logger.error(message);
      throw new InternalServerErrorException(
        'Hasil TTE sudah diterima tetapi penyelesaian naskah belum tersedia',
      );
    }

    await handler.completeSigning(transaction, signedFilePath);
  }

  async failSigning(
    transaction: TteSigningTransactionEntity,
    message: string,
  ): Promise<void> {
    if (transaction.jenisNaskah?.toUpperCase() !== 'SDE_MASAL') return;
    const handler = this.resolveHandler('SdeMasalTteCompletionHandler');
    if (handler?.failSigning) {
      await handler.failSigning(transaction, message);
    }
  }

  private resolveHandler(className: string): TteCompletionHandler | null {
    try {
      return this.moduleRef.get<TteCompletionHandler>(className, {
        strict: false,
      });
    } catch {
      return null;
    }
  }
}
