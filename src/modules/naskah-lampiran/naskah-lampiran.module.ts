import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NaskahLampiranController } from './controllers/naskah_lampiran.controller';
import { NaskahLampiranService } from './services/naskah_lampiran.service';
import { NaskahLampiranEntity } from './entities/naskah_lampiran.entity';
import { NaskahEntity } from '../naskah/entities/naskah.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NaskahLampiranEntity, NaskahEntity])],
  controllers: [NaskahLampiranController],
  providers: [NaskahLampiranService],
  exports: [NaskahLampiranService, TypeOrmModule],
})
export class NaskahLampiranModule {}
