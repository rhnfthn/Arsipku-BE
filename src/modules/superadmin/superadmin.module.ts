import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './controllers/admin.controller';
import { AdminService } from './services/admin.service';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserRoleHistoryEntity } from './entities/user-role-history.entity';
import { Person } from '../master-data/person/entities/person.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserRoleEntity, UserRoleHistoryEntity, Person]),
    OrgDataModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService, TypeOrmModule],
})
export class SuperadminModule {}
