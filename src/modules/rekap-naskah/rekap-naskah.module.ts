import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RekapNaskahController } from './controllers/rekap-naskah.controller';
import { RekapNaskahService } from './services/rekap-naskah.service';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { StorageModule } from '../storage/storage.module';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NomorRequestEntity,
      NomorRequestDetailEntity,
      JenisEntity,
    ]),
    StorageModule,
    OrgDataModule,
  ],
  controllers: [RekapNaskahController],
  providers: [RekapNaskahService],
  exports: [RekapNaskahService],
})
export class RekapNaskahModule {}
