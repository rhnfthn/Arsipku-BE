import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Berkas } from './entities/berkas.entity';
import { BerkasController } from './controllers';
import { BerkasService } from './services';
import { KlasifikasiEntity } from '../klasifikasi/entities/klasifikasi.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Berkas, KlasifikasiEntity])],
  controllers: [BerkasController],
  providers: [BerkasService],
  exports: [BerkasService],
})
export class BerkasModule {}
