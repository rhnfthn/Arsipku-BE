import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahDinasController } from './controllers/naskah-dinas.controller';
import { NaskahDinasService } from './services/naskah-dinas.service';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { NaskahDinasVerifikatorEntity } from './entities/naskah-dinas-verifikator.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahSirkulasi,
      EksternalEntity,
      NaskahDinasVerifikatorEntity,
    ]),
    OrgDataModule,
    StorageModule,
  ],
  controllers: [NaskahDinasController],
  providers: [NaskahDinasService],
  exports: [NaskahDinasService],
})
export class NaskahDinasModule {}
