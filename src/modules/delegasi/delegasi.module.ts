import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelegasiController } from './controllers/delegasi.controller';
import { DelegasiService } from './services/delegasi.service';
import { DelegasiEntity } from './entities/delegasi.entity';
import { OmPosition } from '../master-data/position/entities/om-position.entity';
import { PositionService } from '../master-data/position/position.service';
import { OrgDatum } from '../master-data/org_data/entities/org_datum.entity';
import { OrgDataService } from '../master-data/org_data/org_data.service';

@Module({
  imports: [TypeOrmModule.forFeature([DelegasiEntity, OmPosition, OrgDatum])],
  controllers: [DelegasiController],
  providers: [DelegasiService, PositionService, OrgDataService],
  exports: [DelegasiService, TypeOrmModule],
})
export class DelegasiModule {}
