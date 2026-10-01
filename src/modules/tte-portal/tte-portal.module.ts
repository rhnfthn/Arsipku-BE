import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TtePortalController } from './controllers/tte-portal.controller';
import { TtePortalClientService } from './services/tte-portal-client.service';
import { TteSigningService } from './services/tte-signing.service';
import { TteSigningGateway } from './services/tte-signing-gateway.service';
import { TteCompletionDispatcher } from './services/tte-completion-dispatcher.service';
import { TteSigningTransactionEntity } from './entities/tte-signing-transaction.entity';
import { StorageModule } from '../storage/storage.module';
import { DigsigModule } from '../digsig/digsig.module';
import { ConfigAdminModule } from '../config/config.module';
import { Session } from '../auth/entities/session.entity';
import { TteSignerIdentityService } from './services/tte-signer-identity.service';
import { PortalNaskahTteCompletionHandler } from './services/portal-naskah-tte-completion.handler';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { SearchModule } from '../search/search.module';

/**
 * Modul integrasi Portal TTE (client).
 *
 * Berjalan paralel dengan modul digsig existing (mode bsre_direct).
 * Pemilihan jalur via config_digsig.tte_mode (bsre_direct | portal) — modul ini
 * TIDAK menggantikan modul lama sampai terverifikasi end-to-end.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TteSigningTransactionEntity,
      Session,
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
    ]),
    StorageModule,
    DigsigModule,
    ConfigAdminModule,
    SearchModule,
  ],
  controllers: [TtePortalController],
  providers: [
    TtePortalClientService,
    TteSigningService,
    TteSigningGateway,
    TteCompletionDispatcher,
    TteSignerIdentityService,
    PortalNaskahTteCompletionHandler,
    {
      provide: 'PortalNaskahTteCompletionHandler',
      useExisting: PortalNaskahTteCompletionHandler,
    },
  ],
  exports: [
    TtePortalClientService,
    TteSigningService,
    TteSigningGateway,
    PortalNaskahTteCompletionHandler,
  ],
})
export class TtePortalModule {}
