import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { DisposisiController } from './controllers';

// Services
import { DisposisiService } from './services/disposisi.service';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { GeneratePdfDispoService } from '../generate_pdf/services/generate_pdf_dispo.service';

// Entities - Local
import { DiEntity } from './entities/di.entity';

// Entities - Shared
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../shared/entities/naskah_referensi.entity';

// External Dependencies
import { Person } from '../master-data/person/entities/person.entity';
import { RelationSp } from '../master-data/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from '../master-data/relation_osc/entities/relation_osc.entity';
import { RelationOa } from '../master-data/relation_oa/entities/relation_oa.entity';
import { OmPosition } from '../master-data/position/entities/om-position.entity';
import { OmAreaSub } from '../master-data/areasub/entities/om-areasub.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DiEntity,
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      Person,
      RelationSp,
      RelationOsc,
      RelationOa,
      OmPosition,
      OmAreaSub,
    ]),
    OrgDataModule,
  ],
  controllers: [DisposisiController],
  providers: [DisposisiService, NomorSuratService, GeneratePdfDispoService],
  exports: [DisposisiService],
})
export class DisposisiModule {}
