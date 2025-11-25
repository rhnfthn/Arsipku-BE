import { Module } from '@nestjs/common';
import { OrgDataController } from './org_data.controller';
import { RelationOoModule } from 'src/relation_oo/relation_oo.module';
import { RelationOaModule } from 'src/relation_oa/relation_oa.module';
import { RelationOsModule } from 'src/relation_os/relation_os.module';
import { RelationOscModule } from 'src/relation_osc/relation_osc.module';
import { RelationSpModule } from 'src/relation_sp/relation_sp.module';
import { RelationOdModule } from 'src/relation_od/relation_od.module';
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
})
export class OrgDataModule {}
