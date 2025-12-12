import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NomorEntity } from './entities/nomor.entity';
import { NomorRequestEntity } from './entities/nomor-request.entity';
import { NomorRequestDetailEntity } from './entities/nomor-request-detail.entity';
import { NomorService } from './services/nomor.service';
import { NomorController } from './controllers/nomor.controller';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NomorEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
    ]),
    OrgDataModule,
    StorageModule,
  ],
  controllers: [NomorController],
  providers: [NomorService],
  exports: [NomorService],
})
export class NomorModule {}
