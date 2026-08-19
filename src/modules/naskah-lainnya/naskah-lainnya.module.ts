import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahLainnyaController } from './controllers/naskah-lainnya.controller';
import { NaskahLainnyaService } from './services/naskah-lainnya.service';
import { WorkflowService } from './services/workflow.service';
import { DocxReaderService } from './services/docx-reader.service';
import { DocxQrInlineService } from './services/docx-qr-inline.service';
import { DocxFillerService } from '../naskah-umum/services/docx-filler.service';
import { DigsigModule } from '../digsig/digsig.module';
import { StorageModule } from '../storage/storage.module';
import { KonfigurasiModule } from '../konfigurasi/konfigurasi.module';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from './entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from './entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from './entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from './entities/naskah-lainnya-dokumen.entity';
import { NomorModule } from '../nomor/nomor.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahLainnyaApprovalEntity,
      NaskahLainnyaRiwayatEntity,
      NaskahLainnyaBlankoEntity,
      NaskahLainnyaDokumenEntity,
    ]),
    StorageModule,
    KonfigurasiModule,
    DigsigModule,
    NomorModule,
  ],
  controllers: [NaskahLainnyaController],
  providers: [
    NaskahLainnyaService,
    WorkflowService,
    DocxReaderService,
    DocxQrInlineService,
    DocxFillerService,
  ],
  exports: [NaskahLainnyaService],
})
export class NaskahLainnyaModule {}
