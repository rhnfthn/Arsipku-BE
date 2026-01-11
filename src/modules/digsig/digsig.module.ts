import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DigsigController } from './controllers';
import { DigsigService } from './services';
import { QRCodeService } from './services/qrcode.service';
import { PdfQrEmbedService } from './services/pdf-qr-embed.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { NdEntity } from '../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../surat-dinas-internal/entities/sdi_sde.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { Session } from '../auth/entities/session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NdEntity, SdiSdeEntity, NaskahEntity, NaskahSirkulasi, Session]),
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
  ],
  controllers: [DigsigController],
  providers: [DigsigService, QRCodeService, PdfQrEmbedService],
  exports: [DigsigService, QRCodeService, PdfQrEmbedService],
})
export class DigsigModule {}
