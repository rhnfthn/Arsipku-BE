import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';
import { DigsigDocumentEntity, DigsigDocumentSignerEntity } from '../digsig/entities';
import { KonsepEntity } from '../konsep/entities/konsep.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahSirkulasi,
      NaskahEntity,
      DigsigDocumentEntity,
      DigsigDocumentSignerEntity,
      KonsepEntity,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
