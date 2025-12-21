import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageService } from './services/storage.service';
import { UploadTemporaryController } from './controllers/upload-temporary.controller';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { NaskahEntity } from '../../shared/entities/naskah.entity';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([NaskahLampiranEntity, NaskahEntity]),
  ],
  controllers: [UploadTemporaryController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
