import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahSirkulasiController } from './controllers/naskah_sirkulasi.controller';
import { NaskahSirkulasiService } from './services/naskah_sirkulasi.service';
import { NaskahSirkulasi } from './entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NaskahSirkulasi, NaskahEntity])],
  controllers: [NaskahSirkulasiController],
  providers: [NaskahSirkulasiService],
  exports: [NaskahSirkulasiService, TypeOrmModule],
})
export class NaskahSirkulasiModule {}
