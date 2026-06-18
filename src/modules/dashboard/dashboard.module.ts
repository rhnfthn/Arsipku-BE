import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { RealtimeSummaryService } from './services/realtime-summary.service';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { DigsigDocumentEntity, DigsigDocumentSignerEntity } from '../digsig/entities';
import { KonsepEntity } from '../konsep/entities/konsep.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { NaskahSirkulasiModule } from '../naskah-sirkulasi/naskah-sirkulasi.module';
import { LabelModule } from '../label/label.module';
import { DigsigModule } from '../digsig/digsig.module';

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
    ]),
    NaskahSirkulasiModule,
    LabelModule,
    DigsigModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, RealtimeSummaryService],
  exports: [DashboardService, RealtimeSummaryService],
})
export class DashboardModule {}
