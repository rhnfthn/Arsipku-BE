import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahShareController } from './controllers/naskah-share.controller';
import { NaskahShareService } from './services/naskah-share.service';
import { NaskahShareEntity } from './entities/naskah-share.entity';
import { NaskahShareRecipientEntity } from './entities/naskah-share-recipient.entity';
import { NaskahShareLogEntity } from './entities/naskah-share-log.entity';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { Person } from '../master-data/person/entities/person.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConfigAdminModule } from '../config/config.module';
import { NaskahLainnyaDokumenEntity } from '../naskah-lainnya/entities/naskah-lainnya-dokumen.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahShareEntity,
      NaskahShareRecipientEntity,
      NaskahShareLogEntity,
      NaskahSirkulasi,
      NaskahEntity,
      NaskahLainnyaDokumenEntity,
      Person,
    ]),
    OrgDataModule,
    NotificationModule,
    RealtimeModule,
    ConfigAdminModule,
  ],
  controllers: [NaskahShareController],
  providers: [NaskahShareService],
  exports: [NaskahShareService],
})
export class NaskahShareModule {}
