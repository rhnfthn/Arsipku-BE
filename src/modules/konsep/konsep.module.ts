import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KonsepController } from './controllers/konsep.controller';
import { KonsepService } from './services/konsep.service';
import { KonsepEntity } from './entities/konsep.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../naskah-lampiran/entities/naskah_lampiran.entity';
import { NdEntity } from '../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../surat-dinas-internal/entities/sdi_sde.entity';
import { OrgDataModule } from 'src/modules/master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KonsepEntity,
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NdEntity,
      SdiSdeEntity,
    ]),
    OrgDataModule,
  ],
  controllers: [KonsepController],
  providers: [KonsepService],
  exports: [KonsepService, TypeOrmModule],
})
export class KonsepModule {}
