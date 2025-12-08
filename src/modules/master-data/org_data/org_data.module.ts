import { Module } from '@nestjs/common';
import { OrgDataController } from './org_data.controller';
import { RelationOoModule } from '../relation_oo/relation_oo.module';
import { RelationOaModule } from '../relation_oa/relation_oa.module';
import { RelationOsModule } from '../relation_os/relation_os.module';
import { RelationOscModule } from '../relation_osc/relation_osc.module';
import { RelationSpModule } from '../relation_sp/relation_sp.module';
import { RelationOdModule } from '../relation_od/relation_od.module';
import { OrgDataService } from './org_data.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgDatum } from './entities/org_datum.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrgDatum]),
    RelationOoModule,
    RelationOaModule,
    RelationOsModule,
    RelationOscModule,
    RelationSpModule,
    RelationOdModule,
  ],
  controllers: [OrgDataController],
  providers: [OrgDataService],
  exports: [OrgDataService],
})
export class OrgDataModule {}
