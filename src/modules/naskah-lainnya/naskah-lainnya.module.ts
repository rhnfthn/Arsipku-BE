import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahLainnyaController } from './controllers/naskah-lainnya.controller';
import { NaskahLainnyaService } from './services/naskah-lainnya.service';
import { WorkflowService } from './services/workflow.service';
import { DocxReaderService } from './services/docx-reader.service';
import { DocxQrInlineService } from './services/docx-qr-inline.service';
import { NaskahLainnyaTteCompletionHandler } from './services/naskah-lainnya-tte-completion.handler';
import { DocxFillerService } from '../naskah-umum/services/docx-filler.service';
import { DigsigModule } from '../digsig/digsig.module';
import { TtePortalModule } from '../tte-portal/tte-portal.module';
import { StorageModule } from '../storage/storage.module';
import { KonfigurasiModule } from '../konfigurasi/konfigurasi.module';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from './entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from './entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from './entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from './entities/naskah-lainnya-dokumen.entity';
import { NomorModule } from '../nomor/nomor.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { GotenbergModule } from '../gotenberg/gotenberg.module';

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
    TtePortalModule,
    NomorModule,
    GeneratePdfModule,
    OrgDataModule,
    GotenbergModule,
  ],
  controllers: [NaskahLainnyaController],
  providers: [
    NaskahLainnyaService,
    WorkflowService,
    DocxReaderService,
    DocxQrInlineService,
    DocxFillerService,
    NaskahLainnyaTteCompletionHandler,
    {
      provide: 'NaskahLainnyaTteCompletionHandler',
      useExisting: NaskahLainnyaTteCompletionHandler,
    },
  ],
  exports: [NaskahLainnyaService],
})
export class NaskahLainnyaModule {}
