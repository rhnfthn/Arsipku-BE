import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahSirkulasiController } from './controllers/naskah_sirkulasi.controller';
import { NaskahSirkulasiService } from './services/naskah_sirkulasi.service';
import { NaskahSirkulasi } from './entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../naskah-referensi/entities/naskah_referensi.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { SdiSdeEntity } from '../surat-dinas-eksternal/entities/sdi_sde.entity';
import { LabelModule } from '../label/label.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NaskahSirkulasi, NaskahEntity, NaskahLampiranEntity, NaskahReferensiEntity, EksternalEntity, SdiSdeEntity]),
    LabelModule,
  ],
  controllers: [NaskahSirkulasiController],
  providers: [NaskahSirkulasiService],
  exports: [NaskahSirkulasiService, TypeOrmModule],
})
export class NaskahSirkulasiModule {}
