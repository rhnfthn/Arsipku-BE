import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuratDinasInternalController } from './controllers/surat-dinas-internal.controller';
import { SuratDinasInternalService } from './services/surat-dinas-internal.service';
// SdiSdeEntity removed - data now stored in naskah and naskah_sirkulasi
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { NomorEntity } from '../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { Session } from '../auth/entities/session.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { DigsigModule } from '../digsig/digsig.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // SdiSdeEntity removed - no longer needed
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NomorEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
      JenisEntity,
      Session,
    ]),
    OrgDataModule,
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
    DigsigModule,
    SearchModule,
  ],
  controllers: [SuratDinasInternalController],
  providers: [SuratDinasInternalService, NomorSuratService],
  exports: [SuratDinasInternalService],
})
export class SuratDinasInternalModule { }
