import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelegasiController } from './controllers/delegasi.controller';
import { DelegasiService } from './services/delegasi.service';
import { DelegasiEntity } from './entities/delegasi.entity';
import { OmPosition } from '../master-data/position/entities/om-position.entity';
import { PositionService } from '../master-data/position/position.service';
import { RelationOs } from '../master-data/relation_os/entities/relation_os.entity';
import { RelationOsc } from '../master-data/relation_osc/entities/relation_osc.entity';
import { OmOrganization } from '../master-data/organization/entities/om-organization.entity';
import { OrgDatum } from '../master-data/org_data/entities/org_datum.entity';
import { OrgDataService } from '../master-data/org_data/org_data.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DelegasiEntity, OmPosition, RelationOs, RelationOsc, OmOrganization, OrgDatum]),
    forwardRef(() => AuthModule),
  ],
  controllers: [DelegasiController],
  providers: [DelegasiService, PositionService, OrgDataService],
  exports: [DelegasiService, TypeOrmModule],
})
export class DelegasiModule {}
