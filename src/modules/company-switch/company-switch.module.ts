import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanySwitchController } from './controllers/company-switch.controller';
import { CompanySwitchService } from './services/company-switch.service';
import { RelationSp } from '../master-data/relation_sp/entities/relation_sp.entity';
import { OmCompany } from '../master-data/company/entities/om-company.entity';
import { OmPosition } from '../master-data/position/entities/om-position.entity';
import { OrgDatum } from '../master-data/org_data/entities/org_datum.entity';
import { OrgDataService } from '../master-data/org_data/org_data.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RelationSp, OmCompany, OmPosition, OrgDatum]),
    forwardRef(() => AuthModule),
  ],
  controllers: [CompanySwitchController],
  providers: [CompanySwitchService, OrgDataService],
  exports: [CompanySwitchService],
})
export class CompanySwitchModule {}
