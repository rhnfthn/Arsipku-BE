import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahUmumController } from './naskah-umum.controller';
import { NaskahUmumService } from './services/naskah-umum.service';
import { DocxFillerService } from './services/docx-filler.service';
import { StorageModule } from '../storage/storage.module';
import { OnlyOfficeModule } from '../onlyoffice/onlyoffice.module';
import { DigsigModule } from '../digsig/digsig.module';
import { NaskahUmumTempEntity } from '../onlyoffice/entities';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { GrupPenerimaModule } from '../grup-penerima/grup-penerima.module';

@Module({
  imports: [
    ConfigModule,
    // NaskahEntity needed for NomorSuratService's @InjectRepository(NaskahEntity)
    TypeOrmModule.forFeature([NaskahUmumTempEntity, NaskahEntity]),
    StorageModule,
    OnlyOfficeModule,
    DigsigModule,
    GrupPenerimaModule,
  ],
  controllers: [NaskahUmumController],
  providers: [NaskahUmumService, DocxFillerService, NomorSuratService],
  exports: [NaskahUmumService],
})
export class NaskahUmumModule {}
