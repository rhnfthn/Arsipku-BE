import { Module } from '@nestjs/common';
import { AreasubService } from './areasub.service';
import { AreasubController } from './areasub.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OmAreaSub } from './entities/om-areasub.entity';
import { SubAreaAlamatModule } from '../../sub-area-alamat/sub-area-alamat.module';

@Module({
  imports: [TypeOrmModule.forFeature([OmAreaSub]), SubAreaAlamatModule],
  controllers: [AreasubController],
  providers: [AreasubService],
})
export class AreasubModule {}
