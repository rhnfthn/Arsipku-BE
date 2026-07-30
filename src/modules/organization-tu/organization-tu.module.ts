import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationTuEntity } from './entities/organization-tu.entity';
import { OrganizationTuService } from './organization-tu.service';
import { OrganizationTuController } from './organization-tu.controller';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationTuEntity]), OrgDataModule],
  controllers: [OrganizationTuController],
  providers: [OrganizationTuService],
  exports: [OrganizationTuService, TypeOrmModule],
})
export class OrganizationTuModule {}
