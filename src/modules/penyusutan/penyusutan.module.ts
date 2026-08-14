import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PenyusutanEntity } from './entities/penyusutan.entity';
import { PenyusutanVerifikatorEntity } from './entities/penyusutan-verifikator.entity';
import { PenyusutanService } from './services/penyusutan.service';
import { PenyusutanController } from './controllers/penyusutan.controller';
import { AuditModule } from '../audit/audit.module';
import { ArsipModule } from '../arsip/arsip.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PenyusutanEntity, PenyusutanVerifikatorEntity]),
    AuditModule,
    ArsipModule,
  ],
  controllers: [PenyusutanController],
  providers: [PenyusutanService],
  exports: [PenyusutanService],
})
export class PenyusutanModule {}
