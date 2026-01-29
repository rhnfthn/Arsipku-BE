import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahController } from './controllers/naskah.controller';
import { NaskahService } from './services/naskah.service';
import { NaskahEntity } from './entities/naskah.entity';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../naskah-referensi/entities/naskah_referensi.entity';
import { DiEntity } from '../disposisi/entities/di.entity';
// REMOVED: NdEntity and SdiSdeEntity - tables nd and sdi_sde no longer used
// import { NdEntity } from '../nota-dinas/entities/nd.entity';
// import { SdiSdeEntity } from '../surat-dinas-internal/entities/sdi_sde.entity';
import { StorageModule } from '../storage/storage.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      DiEntity,
      // REMOVED: NdEntity and SdiSdeEntity
    ]),
    StorageModule,
    SearchModule,
  ],
  controllers: [NaskahController],
  providers: [NaskahService],
  exports: [NaskahService, TypeOrmModule],
})
export class NaskahModule { }
