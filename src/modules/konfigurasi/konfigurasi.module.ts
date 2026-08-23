import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalRoleEntity } from './entities/legal-role.entity';
import { LegalRoleService } from './services/legal-role.service';
import { LegalRoleController } from './controllers/legal-role.controller';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LegalRoleEntity]),
    OrgDataModule,
  ],
  providers: [LegalRoleService],
  controllers: [LegalRoleController],
  exports: [LegalRoleService],
})
export class KonfigurasiModule {}