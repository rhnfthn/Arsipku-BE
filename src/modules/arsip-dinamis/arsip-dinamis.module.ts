import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Berkas } from '../berkas/entities/berkas.entity';
import { KlasifikasiEntity } from '../klasifikasi/entities/klasifikasi.entity';
import { BerkasNaskah, BerkasVerifikasi, BerkasRiwayatRetensi } from './entities';
import { ArsipDinamisController } from './controllers';
import { ArsipDinamisService } from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Berkas,
      KlasifikasiEntity,
      BerkasNaskah,
      BerkasVerifikasi,
      BerkasRiwayatRetensi,
    ]),
  ],
  controllers: [ArsipDinamisController],
  providers: [ArsipDinamisService],
  exports: [ArsipDinamisService, TypeOrmModule],
})
export class ArsipDinamisModule {}
