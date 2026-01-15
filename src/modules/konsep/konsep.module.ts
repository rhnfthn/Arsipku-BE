import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KonsepController } from './controllers/konsep.controller';
import { KonsepService } from './services/konsep.service';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../naskah-referensi/entities/naskah_referensi.entity';
import { NdEntity } from '../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../surat-dinas-internal/entities/sdi_sde.entity';
import { DiEntity } from '../disposisi/entities/di.entity';
import { KonsepRiwayatEntity } from './entities/konsep-riwayat.entity';
import { NomorEntity } from '../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { OrgDataModule } from 'src/modules/master-data/org_data/org_data.module';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      NdEntity,
      SdiSdeEntity,
      DiEntity,
      KonsepRiwayatEntity,
      NomorEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
      JenisEntity,
    ]),
    OrgDataModule,
    StorageModule,
    GeneratePdfModule,
  ],
  controllers: [KonsepController],
  providers: [KonsepService],
  exports: [KonsepService, TypeOrmModule],
})
export class KonsepModule {}
