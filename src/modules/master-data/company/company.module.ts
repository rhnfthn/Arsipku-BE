import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { OmCompany } from './entities/om-company.entity';
import { OmOrganization } from '../organization/entities/om-organization.entity';
import { OmPosition } from '../position/entities/om-position.entity';
import { Person } from '../person/entities/person.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OmCompany,
      OmOrganization,
      OmPosition,
      Person,
    ]),
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
