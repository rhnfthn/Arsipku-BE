import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArsipService } from './services/arsip.service';
import { ArsipController } from './controllers/arsip.controller';
import {
  ArsipBerkasEntity,
  ArsipBerkasNaskahEntity,
  ArsipNaskahEntity,
  ArsipNaskahLampiranEntity,
  ArsipPenyusutanLogEntity,
  ArsipTransferLogEntity,
} from './entities';
import { Berkas } from '../berkas/entities/berkas.entity';
import { BerkasNaskah } from '../arsip-dinamis/entities/berkas-naskah.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    StorageModule,
    // Entities dari DB arsip (koneksi archiveConnection)
    TypeOrmModule.forFeature(
      [
        ArsipBerkasEntity,
        ArsipBerkasNaskahEntity,
        ArsipNaskahEntity,
        ArsipNaskahLampiranEntity,
        ArsipPenyusutanLogEntity,
        ArsipTransferLogEntity,
      ],
      'archiveConnection',
    ),
    // Entities dari DB inti untuk baca data sumber
    TypeOrmModule.forFeature(
      [Berkas, BerkasNaskah, NaskahEntity, NaskahLampiranEntity],
    ),
  ],
  controllers: [ArsipController],
  providers: [ArsipService],
  exports: [ArsipService],
})
export class ArsipModule {}
