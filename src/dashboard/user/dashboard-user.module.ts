import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardUserController } from './dashboard-user.controller';
import { DashboardUserService } from './dashboard-user.service';
import { NaskahSirkulasi } from 'src/persuratan/entity/naskah_sirkulasi.entity';
import { NaskahEntity } from 'src/persuratan/entity/naskah.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NaskahSirkulasi, NaskahEntity])],
  controllers: [DashboardUserController],
  providers: [DashboardUserService],
  exports: [DashboardUserService],
})
export class DashboardUserModule {}
