import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrupPenerimaDetailController } from './controllers/grup_penerima_detail.controller';
import { GrupPenerimaDetailService } from './services/grup_penerima_detail.service';
import { GrupPenerimaDetailEntity } from './entities/grup_penerima_detail.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GrupPenerimaDetailEntity])],
  controllers: [GrupPenerimaDetailController],
  providers: [GrupPenerimaDetailService],
  exports: [GrupPenerimaDetailService, TypeOrmModule],
})
export class GrupPenerimaDetailModule {}
