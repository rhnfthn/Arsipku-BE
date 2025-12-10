import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuratDinasEksternalController } from './controllers/surat-dinas-eksternal.controller';
import { SuratDinasEksternalService } from './services/surat-dinas-eksternal.service';
import { SdiSdeEntity } from './entities/sdi_sde.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SdiSdeEntity,
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      EksternalEntity,
    ]),
    OrgDataModule,
  ],
  controllers: [SuratDinasEksternalController],
  providers: [SuratDinasEksternalService, NomorSuratService],
  exports: [SuratDinasEksternalService],
})
export class SuratDinasEksternalModule {}
