import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuratDinasInternalController } from './controllers/surat-dinas-internal.controller';
import { SuratDinasInternalService } from './services/surat-dinas-internal.service';
import { SdiSdeEntity } from './entities/sdi_sde.entity';
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
import { GeneratePdfSudinService } from '../generate_pdf/services/generate_pdf_sudin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SdiSdeEntity,
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
  ],
  controllers: [SuratDinasInternalController],
  providers: [SuratDinasInternalService, NomorSuratService, GeneratePdfSudinService],
  exports: [SuratDinasInternalService],
})
export class SuratDinasInternalModule {}
