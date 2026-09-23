import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdeMasalEntity } from './entities/sde-masal.entity';
import { SdeMasalService } from './services/sde-masal.service';
import { SdeMasalController } from './controllers/sde-masal.controller';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { SuratDinasEksternalModule } from '../surat-dinas-eksternal/surat-dinas-eksternal.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationModule } from '../notification/notification.module';
import { SdeMasalFolderEntity } from './entities/sde-masal-folder.entity';
import { TtePortalModule } from '../tte-portal/tte-portal.module';
import { SdeMasalTteCompletionHandler } from './services/sde-masal-tte-completion.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SdeMasalEntity,
      SdeMasalFolderEntity,
      NaskahEntity,
      NaskahSirkulasi,
      EksternalEntity,
    ]),
    OrgDataModule,
    SuratDinasEksternalModule,
    StorageModule,
    NotificationModule,
    TtePortalModule,
  ],
  controllers: [SdeMasalController],
  providers: [
    SdeMasalService,
    SdeMasalTteCompletionHandler,
    {
      provide: 'SdeMasalTteCompletionHandler',
      useExisting: SdeMasalTteCompletionHandler,
    },
  ],
  exports: [SdeMasalService],
})
export class SdeMasalModule {}
