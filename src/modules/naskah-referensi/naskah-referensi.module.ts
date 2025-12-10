import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahReferensiController } from './controllers/naskah_referensi.controller';
import { NaskahReferensiService } from './services/naskah_referensi.service';
import { NaskahReferensiEntity } from './entities/naskah_referensi.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NaskahReferensiEntity, NaskahEntity])],
  controllers: [NaskahReferensiController],
  providers: [NaskahReferensiService],
  exports: [NaskahReferensiService, TypeOrmModule],
})
export class NaskahReferensiModule {}
