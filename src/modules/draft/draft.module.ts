import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DraftController } from './controllers/draft.controller';
import { DraftService } from './services/draft.service';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../naskah-referensi/entities/naskah_referensi.entity';
import { SdiSdeEntity } from '../surat-dinas-eksternal/entities/sdi_sde.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { LabelModule } from '../label/label.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NaskahReferensiEntity,
      SdiSdeEntity,
      EksternalEntity,
    ]),
    LabelModule,
  ],
  controllers: [DraftController],
  providers: [DraftService],
  exports: [DraftService, TypeOrmModule],
})
export class DraftModule {}
