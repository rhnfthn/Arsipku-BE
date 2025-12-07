import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KlasifikasiController } from './controllers/klasifikasi.controller';
import { KlasifikasiService } from './services/klasifikasi.service';
import { KlasifikasiEntity } from './entities/klasifikasi.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KlasifikasiEntity])],
  controllers: [KlasifikasiController],
  providers: [KlasifikasiService],
  exports: [KlasifikasiService, TypeOrmModule],
})
export class KlasifikasiModule {}
