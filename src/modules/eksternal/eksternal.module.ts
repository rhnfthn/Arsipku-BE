import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EksternalController } from './controllers/eksternal.controller';
import { EksternalService } from './services/eksternal.service';
import { EksternalEntity } from './entities/eksternal.entity';
import { OrgDatum } from '../master-data/org_data/entities/org_datum.entity';
import { OrgDataService } from '../master-data/org_data/org_data.service';

@Module({
  imports: [TypeOrmModule.forFeature([EksternalEntity, OrgDatum])],
  controllers: [EksternalController],
  providers: [EksternalService, OrgDataService],
  exports: [EksternalService, TypeOrmModule],
})
export class EksternalModule {}
