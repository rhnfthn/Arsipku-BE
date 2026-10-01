import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EksternalController } from './controllers/eksternal.controller';
import { EksternalService } from './services/eksternal.service';
import { EksternalEntity } from './entities/eksternal.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [TypeOrmModule.forFeature([EksternalEntity]), OrgDataModule],
  controllers: [EksternalController],
  providers: [EksternalService],
  exports: [EksternalService, TypeOrmModule],
})
export class EksternalModule {}
