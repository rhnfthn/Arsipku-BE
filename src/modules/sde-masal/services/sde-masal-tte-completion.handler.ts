import { Injectable } from '@nestjs/common';
import { TteCompletionHandler } from '../../tte-portal/services/tte-signing.service';
import { TteSigningTransactionEntity } from '../../tte-portal/entities/tte-signing-transaction.entity';
import { PortalNaskahTteCompletionHandler } from '../../tte-portal/services/portal-naskah-tte-completion.handler';
import { SdeMasalService } from './sde-masal.service';

@Injectable()
export class SdeMasalTteCompletionHandler implements TteCompletionHandler {
  constructor(
    private readonly naskahCompletion: PortalNaskahTteCompletionHandler,
    private readonly sdeMasalService: SdeMasalService,
  ) {}

  async completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void> {
    await this.naskahCompletion.completeSigning(transaction, signedFilePath);
    if (transaction.idNaskah) {
      await this.sdeMasalService.completePortalItem(transaction.idNaskah);
    }
  }

  async failSigning(
    transaction: TteSigningTransactionEntity,
    message: string,
  ): Promise<void> {
    if (transaction.idNaskah) {
      await this.sdeMasalService.failPortalItem(transaction.idNaskah, message);
    }
  }
}
