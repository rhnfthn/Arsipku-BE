import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelEntity } from './entity/label.entity';
import { KlasifikasiEntity } from './entity/klasifikasi.entity';
import { DisposisiItemEntity } from './entity/disposisi_item.entity';
import { SubAreaAlamatEntity } from './entity/sub_area_alamat.entity';
import { EksternalEntity } from './entity/eksternal.entity';
import { GrupPenerimaEntity } from './entity/grup_penerima.entity';
import { GrupPenerimaDetailEntity } from './entity/grup_penerima_detail.entity';
import { NaskahSirkulasi } from './entity/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from './entity/naskah_lampiran.entity';
import { NaskahReferensiEntity } from './entity/naskah_referensi.entity';
import { NaskahEntity } from './entity/naskah.entity';

import { LabelService } from './services/label.service';
import { KlasifikasiService } from './services/klasifikasi.service';
import { DisposisiItemService } from './services/disposisi_item.service';
import { SubAreaAlamatService } from './services/sub_area_alamat.service';
import { EksternalService } from './services/eksternal.service';
import { GrupPenerimaService } from './services/grup_penerima.service';
import { GrupPenerimaDetailService } from './services/grup_penerima_detail.service';
import { NaskahSirkulasiService } from './services/naskah_sirkulasi.service';
import { NaskahLampiranService } from './services/naskah_lampiran.service';
import { NaskahReferensiService } from './services/naskah_referensi.service';
import { NaskahService } from './services/naskah.service';
import { NotaDinasService } from './services/nota-dinas.service';

import { LabelController } from './controllers/label.controller';
import { KlasifikasiController } from './controllers/klasifikasi.controller';
import { DisposisiItemController } from './controllers/disposisi_item.controller';
import { SubAreaAlamatController } from './controllers/sub_area_alamat.controller';
import { EksternalController } from './controllers/eksternal.controller';
import { GrupPenerimaController } from './controllers/grup_penerima.controller';
import { GrupPenerimaDetailController } from './controllers/grup_penerima_detail.controller';
import { NaskahSirkulasiController } from './controllers/naskah_sirkulasi.controller';
import { NaskahLampiranController } from './controllers/naskah_lampiran.controller';
import { NaskahReferensiController } from './controllers/naskah_referensi.controller';
import { NaskahController } from './controllers/naskah.controller';
import { NotaDinasController } from './controllers/nota-dinas.controller';

import { Person } from 'src/person/entities/person.entity';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/relation_oo/entities/relation_oo.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LabelEntity,
      KlasifikasiEntity,
      DisposisiItemEntity,
      SubAreaAlamatEntity,
      EksternalEntity,
      GrupPenerimaEntity,
      GrupPenerimaDetailEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      NaskahEntity,
      Person,
      RelationSp,
      RelationOsc,
      RelationOa,
      RelationOo,
      OmPosition,
    ]),
  ],
  providers: [
    LabelService,
    KlasifikasiService,
    DisposisiItemService,
    SubAreaAlamatService,
    EksternalService,
    GrupPenerimaService,
    GrupPenerimaDetailService,
    NaskahSirkulasiService,
    NaskahLampiranService,
    NaskahReferensiService,
    NaskahService,
    NotaDinasService,
  ],
  controllers: [
    LabelController,
    KlasifikasiController,
    DisposisiItemController,
    SubAreaAlamatController,
    EksternalController,
    GrupPenerimaController,
    GrupPenerimaDetailController,
    NaskahSirkulasiController,
    NaskahLampiranController,
    NaskahReferensiController,
    NaskahController,
    NotaDinasController,
  ],
  exports: [
    LabelService,
    KlasifikasiService,
    DisposisiItemService,
    SubAreaAlamatService,
    EksternalService,
    GrupPenerimaService,
    GrupPenerimaDetailService,
    NaskahSirkulasiService,
    NaskahLampiranService,
    NaskahReferensiService,
    NaskahService,
    NotaDinasService,
  ],
})
export class PersuratanModule {}
