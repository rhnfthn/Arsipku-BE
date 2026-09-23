import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TteCompletionHandler } from '../../tte-portal/services/tte-signing.service';
import { TteSigningTransactionEntity } from '../../tte-portal/entities/tte-signing-transaction.entity';
import { NaskahLainnyaService } from './naskah-lainnya.service';

/**
 * Completion handler untuk Naskah Lainnya setelah TTE Portal sukses.
 *
 * Dipanggil TteSigningService setelah callback portal diproses & PDF TTE
 * tersimpan di MinIO. Meneruskan ke NaskahLainnyaService.completePortalTte
 * yang mengganti PDF final + transisi workflow tanda tangan.
 *
 */
@Injectable()
export class NaskahLainnyaTteCompletionHandler implements TteCompletionHandler {
  private readonly logger = new Logger(NaskahLainnyaTteCompletionHandler.name);

  constructor(private readonly naskahLainnyaService: NaskahLainnyaService) {}

  async completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void> {
    if (!transaction.idNaskah) {
      this.logger.warn(
        `Transaksi ${transaction.id} tidak punya idNaskah — skip completion NL`,
      );
      throw new NotFoundException(
        'Konteks Naskah Lainnya pada transaksi TTE tidak lengkap',
      );
    }
    await this.naskahLainnyaService.completePortalTte(
      transaction.idNaskah,
      signedFilePath,
      {
        persnum: transaction.userPersnum,
        nama: transaction.signerName ?? transaction.userName ?? 'Penandatangan',
      },
    );

    this.logger.log(
      `Naskah Lainnya ${transaction.idNaskah} selesai TTE portal`,
    );
  }
}
