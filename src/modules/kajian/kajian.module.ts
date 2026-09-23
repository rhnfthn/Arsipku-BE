import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KajianController } from './controllers/kajian.controller';
import { KajianService } from './services/kajian.service';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { RelationSp } from '../master-data/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from '../master-data/relation_osc/entities/relation_osc.entity';
import { RelationOa } from '../master-data/relation_oa/entities/relation_oa.entity';
import { RelationOo } from '../master-data/relation_oo/entities/relation_oo.entity';
import { Person } from '../master-data/person/entities/person.entity';
import { OmPosition } from '../master-data/position/entities/om-position.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { DigsigModule } from '../digsig/digsig.module';
import { TtePortalModule } from '../tte-portal/tte-portal.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      RelationSp,
      RelationOsc,
      RelationOa,
      RelationOo,
      Person,
      OmPosition,
    ]),
    OrgDataModule,
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
    DigsigModule,
    TtePortalModule,
    SearchModule,
  ],
  controllers: [KajianController],
  providers: [KajianService, NomorSuratService],
  exports: [KajianService],
})
export class KajianModule {}
