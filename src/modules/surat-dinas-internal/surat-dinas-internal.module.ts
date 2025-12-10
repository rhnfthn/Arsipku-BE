import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuratDinasInternalController } from './controllers/surat-dinas-internal.controller';
import { SuratDinasInternalService } from './services/surat-dinas-internal.service';
import { SdiSdeEntity } from './entities/sdi_sde.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SdiSdeEntity,
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
    ]),
    OrgDataModule,
  ],
  controllers: [SuratDinasInternalController],
  providers: [SuratDinasInternalService, NomorSuratService],
  exports: [SuratDinasInternalService],
})
export class SuratDinasInternalModule {}
