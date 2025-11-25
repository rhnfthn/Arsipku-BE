import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelEntity } from './entity/label.entity';
import { KlasifikasiEntity } from './entity/klasifikasi.entity';
import { DisposisiItemEntity } from './entity/disposisi-item.entity';
import { SubAreaAlamatEntity } from './entity/sub-area-alamat.entity';
import { EksternalEntity } from './entity/eksternal.entity';
import { GrupPenerimaEntity } from './entity/grup-penerima.entity';
import { GrupPenerimaDetailEntity } from './entity/grup-penerima-detail.entity';
import { NaskahSirkulasi } from './entity/naskah_sirkulasi.entity';

import { LabelService } from './services/label.service';
import { KlasifikasiService } from './services/klasifikasi.service';
import { DisposisiItemService } from './services/disposisi-item.service';
import { SubAreaAlamatService } from './services/sub-area-alamat.service';
import { EksternalService } from './services/eksternal.service';
import { GrupPenerimaService } from './services/grup-penerima.service';
import { NaskahSirkulasiService } from './services/naskah_sirkulasi.service';

import { LabelController } from './controllers/label.controller';
import { KlasifikasiController } from './controllers/klasifikasi.controller';
import { DisposisiItemController } from './controllers/disposisi-item.controller';
import { SubAreaAlamatController } from './controllers/sub-area-alamat.controller';
import { EksternalController } from './controllers/eksternal.controller';
import { GrupPenerimaController } from './controllers/grup-penerima.controller';
import { NaskahSirkulasiController } from './controllers/naskah_sirkulasi.controller';

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
    ]),
  ],
  providers: [
    LabelService,
    KlasifikasiService,
    DisposisiItemService,
    SubAreaAlamatService,
    EksternalService,
    GrupPenerimaService,
    NaskahSirkulasiService,
  ],
  controllers: [
    LabelController,
    KlasifikasiController,
    DisposisiItemController,
    SubAreaAlamatController,
    EksternalController,
    GrupPenerimaController,
    NaskahSirkulasiController,
  ],
  exports: [
    LabelService,
    KlasifikasiService,
    DisposisiItemService,
    SubAreaAlamatService,
    EksternalService,
    GrupPenerimaService,
    NaskahSirkulasiService,
  ],
})
export class PersuratanModule {}
