import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahSirkulasiController } from './controllers/naskah_sirkulasi.controller';
import { NaskahSirkulasiService } from './services/naskah_sirkulasi.service';
import { NaskahSirkulasi } from './entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../naskah-referensi/entities/naskah_referensi.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
// REMOVED: SdiSdeEntity - table sdi_sde no longer used
// import { SdiSdeEntity } from '../surat-dinas-eksternal/entities/sdi_sde.entity';
import { LabelModule } from '../label/label.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahSirkulasi,
      NaskahEntity,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      EksternalEntity,
      // REMOVED: SdiSdeEntity
    ]),
    LabelModule,
    SearchModule,
  ],
  controllers: [NaskahSirkulasiController],
  providers: [NaskahSirkulasiService],
  exports: [NaskahSirkulasiService, TypeOrmModule],
})
export class NaskahSirkulasiModule {}
