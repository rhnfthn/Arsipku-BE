import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OmOrganization } from './entities/om-organization.entity';
import { RelationOo } from '../relation_oo/entities/relation_oo.entity';
import { RelationOa } from '../relation_oa/entities/relation_oa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OmOrganization, RelationOo, RelationOa])],
  controllers: [OrganizationController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
