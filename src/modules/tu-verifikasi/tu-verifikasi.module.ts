import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferActiveToInactiveEntity } from '../transfer-active-to-inactive/entities/transfer-active-to-inactive.entity';
import { TuVerifikasiController } from './controllers/tu-verifikasi.controller';
import { TuVerifikasiService } from './services/tu-verifikasi.service';
import { TuGuard } from './guards/tu-guard';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferActiveToInactiveEntity]),
    NotificationModule,
  ],
  controllers: [TuVerifikasiController],
  providers: [TuVerifikasiService, TuGuard],
  exports: [TuVerifikasiService],
})
export class TuVerifikasiModule {}
