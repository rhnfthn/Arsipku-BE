import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { OmCompany } from './entities/om-company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OmCompany]), // ✅ wajib
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
