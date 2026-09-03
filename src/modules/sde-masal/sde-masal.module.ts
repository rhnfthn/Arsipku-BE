import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SdeMasalEntity } from './entities/sde-masal.entity';
import { SdeMasalService } from './services/sde-masal.service';
import { SdeMasalController } from './controllers/sde-masal.controller';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { EksternalEntity } from '../eksternal/entities/eksternal.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { SuratDinasEksternalModule } from '../surat-dinas-eksternal/surat-dinas-eksternal.module';
import { StorageModule } from '../storage/storage.module';
import { SdeMasalFolderEntity } from './entities/sde-masal-folder.entity';

/**
 * Module SDE Masal (Surat Dinas Eksternal Massal).
 *
 * Fitur untuk mengirim banyak SDE sekaligus melalui upload file Excel.
 * Tidak mengubah logic bisnis utama modul korespondensi.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SdeMasalEntity,
      SdeMasalFolderEntity,
      NaskahEntity,
      NaskahSirkulasi,
      EksternalEntity,
    ]),
    OrgDataModule,
    SuratDinasEksternalModule,
    StorageModule,
  ],
  controllers: [SdeMasalController],
  providers: [SdeMasalService],
  exports: [SdeMasalService],
})
export class SdeMasalModule {}
