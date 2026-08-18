import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahLainnyaController } from './controllers/naskah-lainnya.controller';
import { NaskahLainnyaService } from './services/naskah-lainnya.service';
import { WorkflowService } from './services/workflow.service';
import { DocxReaderService } from './services/docx-reader.service';
import { StorageModule } from '../storage/storage.module';
import { KonfigurasiModule } from '../konfigurasi/konfigurasi.module';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from './entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from './entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from './entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from './entities/naskah-lainnya-dokumen.entity';

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
  ],
  controllers: [NaskahLainnyaController],
  providers: [
    NaskahLainnyaService,
    WorkflowService,
    DocxReaderService,
  ],
  exports: [NaskahLainnyaService],
})
export class NaskahLainnyaModule {}
