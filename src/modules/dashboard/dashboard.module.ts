import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { RealtimeSummaryService } from './services/realtime-summary.service';
import { KelolaCountService } from './services/kelola-count.service';
import { REALTIME_SUMMARY_SERVICE } from './realtime-summary.token';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import {
  DigsigDocumentEntity,
  DigsigDocumentSignerEntity,
} from '../digsig/entities';
import { KonsepEntity } from '../konsep/entities/konsep.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { NaskahSirkulasiModule } from '../naskah-sirkulasi/naskah-sirkulasi.module';
import { LabelModule } from '../label/label.module';
import { DigsigModule } from '../digsig/digsig.module';
import { NaskahDinasVerifikatorEntity } from '../naskah-dinas/entities/naskah-dinas-verifikator.entity';
import { BerkasVerifikasi } from '../arsip-dinamis/entities/berkas-verifikasi.entity';
import { NomorModule } from '../nomor/nomor.module';
import { NaskahLainnyaModule } from '../naskah-lainnya/naskah-lainnya.module';
import { TransferActiveToInactiveEntity } from '../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from '../transfer-active-to-inactive/entities/approval-level.entity';
import { PenyusutanEntity } from '../penyusutan/entities/penyusutan.entity';
import { PenyusutanVerifikatorEntity } from '../penyusutan/entities/penyusutan-verifikator.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahSirkulasi,
      NaskahEntity,
      DigsigDocumentEntity,
      DigsigDocumentSignerEntity,
      KonsepEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
      NaskahDinasVerifikatorEntity,
      BerkasVerifikasi,
      TransferActiveToInactiveEntity,
      TransferApprovalLevelEntity,
      PenyusutanEntity,
      PenyusutanVerifikatorEntity,
    ]),
    NaskahSirkulasiModule,
    LabelModule,
    DigsigModule,
    NomorModule,
    NaskahLainnyaModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    RealtimeSummaryService,
    KelolaCountService,
    {
      provide: REALTIME_SUMMARY_SERVICE,
      useExisting: RealtimeSummaryService,
    },
  ],
  exports: [DashboardService, RealtimeSummaryService, REALTIME_SUMMARY_SERVICE],
})
export class DashboardModule {}
