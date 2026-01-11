import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { 
  DigsigController, 
  DigsigLogController, 
  DigsigDocumentController, 
  CekDokumenController, 
  PenandatangananController 
} from './controllers';
import { DigsigService } from './services';
import { DigsigLogService } from './services/digsig-log.service';
import { DigsigDocumentService } from './services/digsig-document.service';
import { CekDokumenService } from './services/cek-dokumen.service';
import { PenandatangananService } from './services/penandatanganan.service';
import { QRCodeService } from './services/qrcode.service';
import { PdfQrEmbedService } from './services/pdf-qr-embed.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NdEntity } from '../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../surat-dinas-internal/entities/sdi_sde.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { Session } from '../auth/entities/session.entity';
import { DigsigLogEntity } from './entities/digsig-log.entity';
import { DigsigDocumentEntity } from './entities/digsig-document.entity';
import { DigsigDocumentSignerEntity } from './entities/digsig-document-signer.entity';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([
      NdEntity, 
      SdiSdeEntity, 
      NaskahEntity, 
      NaskahSirkulasi, 
      Session,
      DigsigLogEntity,
      DigsigDocumentEntity,
      DigsigDocumentSignerEntity,
    ]),
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
    OrgDataModule,
  ],
  controllers: [
    DigsigController, 
    DigsigLogController, 
    DigsigDocumentController, 
    CekDokumenController, 
    PenandatangananController,
  ],
  providers: [
    DigsigService, 
    DigsigLogService, 
    DigsigDocumentService, 
    CekDokumenService, 
    PenandatangananService,
    QRCodeService, 
    PdfQrEmbedService,
  ],
  exports: [
    DigsigService, 
    DigsigLogService, 
    DigsigDocumentService, 
    CekDokumenService, 
    PenandatangananService,
    QRCodeService, 
    PdfQrEmbedService,
  ],
})
export class DigsigModule {}
