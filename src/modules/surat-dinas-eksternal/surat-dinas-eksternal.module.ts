import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuratDinasEksternalController } from './controllers/surat-dinas-eksternal.controller';
import { SuratDinasEksternalService } from './services/surat-dinas-eksternal.service';
// REMOVED: SdiSdeEntity - table sdi_sde tidak lagi digunakan
// import { SdiSdeEntity } from './entities/sdi_sde.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../shared/entities/naskah_referensi.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { NomorEntity } from '../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { DigsigModule } from '../digsig/digsig.module';
import { TtePortalModule } from '../tte-portal/tte-portal.module';
import { SearchModule } from '../search/search.module';
import { MailServiceModule } from '../mail-service/mail-service.module';
import { KonsepModule } from '../konsep/konsep.module';
import { NaskahSirkulasiModule } from '../naskah-sirkulasi/naskah-sirkulasi.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // SdiSdeEntity removed - table sdi_sde tidak lagi digunakan
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      EksternalEntity,
      NomorEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
      JenisEntity,
    ]),
    OrgDataModule,
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
    DigsigModule,
    TtePortalModule,
    SearchModule,
    MailServiceModule,
    KonsepModule,
    NaskahSirkulasiModule,
  ],
  controllers: [SuratDinasEksternalController],
  providers: [SuratDinasEksternalService, NomorSuratService],
  exports: [SuratDinasEksternalService],
})
export class SuratDinasEksternalModule {}
