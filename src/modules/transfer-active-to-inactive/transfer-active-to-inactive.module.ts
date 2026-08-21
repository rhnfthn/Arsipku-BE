import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferActiveToInactiveEntity } from './entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from './entities/approval-level.entity';
import { TransferActiveToInactiveService } from './services/transfer-active-to-inactive.service';
import { TransferActiveToInactiveController } from './controllers/transfer-active-to-inactive.controller';
import { AuditModule } from '../audit/audit.module';
import { Berkas } from '../berkas/entities/berkas.entity';
import { ArsipDinamisModule } from '../arsip-dinamis/arsip-dinamis.module';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { OrganizationTuModule } from '../organization-tu/organization-tu.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransferActiveToInactiveEntity,
      TransferApprovalLevelEntity,
      Berkas,
    ]),
    AuditModule,
    ArsipDinamisModule,
    OrgDataModule,
    OrganizationTuModule,
  ],
  controllers: [TransferActiveToInactiveController],
  providers: [TransferActiveToInactiveService],
  exports: [TransferActiveToInactiveService],
})
export class TransferActiveToInactiveModule {}
