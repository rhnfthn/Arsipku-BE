import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferActiveToInactiveEntity } from '../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { Berkas } from '../berkas/entities/berkas.entity';
import { TuVerifikasiController } from './controllers/tu-verifikasi.controller';
import {
  AtasanTuController,
  TuPenataanController,
} from './controllers/atasan-tu-penataan.controller';
import { TuVerifikasiService } from './services/tu-verifikasi.service';
import { TuGuard } from './guards/tu-guard';
import { AtasanTuGuard } from './guards/atasan-tu-guard';
import { NotificationModule } from '../notification/notification.module';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferActiveToInactiveEntity, Berkas]),
    NotificationModule,
    OrgDataModule,
    StorageModule,
  ],
  controllers: [
    TuVerifikasiController,
    AtasanTuController,
    TuPenataanController,
  ],
  providers: [TuVerifikasiService, TuGuard, AtasanTuGuard],
  exports: [TuVerifikasiService],
})
export class TuVerifikasiModule {}
