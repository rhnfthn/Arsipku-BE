import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlyOfficeService } from './services/onlyoffice.service';
import { OnlyOfficeController } from './onlyoffice.controller';
import { StorageModule } from '../storage/storage.module';
import { NaskahUmumTempEntity } from './entities';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    StorageModule,
    TypeOrmModule.forFeature([NaskahUmumTempEntity]),
  ],
  controllers: [OnlyOfficeController],
  providers: [OnlyOfficeService],
  exports: [OnlyOfficeService],
})
export class OnlyOfficeModule {}
