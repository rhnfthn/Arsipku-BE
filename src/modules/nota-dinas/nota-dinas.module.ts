import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotaDinasController } from './controllers/nota-dinas.controller';
import { NotaDinasService } from './services/nota-dinas.service';
import { NdEntity } from './entities/nd.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { NomorEntity } from '../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { DigsigService } from '../digsig/services';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NdEntity,
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NomorEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
      JenisEntity,
    ]),
    OrgDataModule,
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
  ],
  controllers: [NotaDinasController],
  providers: [NotaDinasService, NomorSuratService, DigsigService],
  exports: [NotaDinasService],
})
export class NotaDinasModule {}
