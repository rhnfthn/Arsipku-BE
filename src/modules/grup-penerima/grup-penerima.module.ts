import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrupPenerimaController } from './controllers/grup_penerima.controller';
import { GrupPenerimaService } from './services/grup_penerima.service';
import { GrupPenerimaEntity } from './entities/grup_penerima.entity';
import { GrupPenerimaDetailEntity } from '../grup-penerima-detail/entities/grup_penerima_detail.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GrupPenerimaEntity, GrupPenerimaDetailEntity])],
  controllers: [GrupPenerimaController],
  providers: [GrupPenerimaService],
  exports: [GrupPenerimaService, TypeOrmModule],
})
export class GrupPenerimaModule {}
