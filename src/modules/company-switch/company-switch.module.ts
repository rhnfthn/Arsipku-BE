import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanySwitchController } from './controllers/company-switch.controller';
import { CompanySwitchService } from './services/company-switch.service';
import { RelationSp } from '../master-data/relation_sp/entities/relation_sp.entity';
import { OmCompany } from '../master-data/company/entities/om-company.entity';
import { OmPosition } from '../master-data/position/entities/om-position.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RelationSp, OmCompany, OmPosition]),
    OrgDataModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [CompanySwitchController],
  providers: [CompanySwitchService],
  exports: [CompanySwitchService],
})
export class CompanySwitchModule {}
