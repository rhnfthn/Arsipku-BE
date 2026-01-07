import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DigsigController } from './controllers';
import { DigsigService } from './services';
import { QRCodeService } from './services/qrcode.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { NdEntity } from '../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../surat-dinas-internal/entities/sdi_sde.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NdEntity, SdiSdeEntity, NaskahEntity]),
    StorageModule,
    GeneratePdfModule,
  ],
  controllers: [DigsigController],
  providers: [DigsigService, QRCodeService],
  exports: [DigsigService],
})
export class DigsigModule {}
