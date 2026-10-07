import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PenyusutanEntity } from './entities/penyusutan.entity';
import { PenyusutanVerifikatorEntity } from './entities/penyusutan-verifikator.entity';
import { PenyusutanService } from './services/penyusutan.service';
import { PenyusutanController } from './controllers/penyusutan.controller';
import { AuditModule } from '../audit/audit.module';
import { ArsipModule } from '../arsip/arsip.module';
import { TuGuard } from '../tu-verifikasi/guards/tu-guard';
import { TuVerifikasiModule } from '../tu-verifikasi/tu-verifikasi.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PenyusutanEntity, PenyusutanVerifikatorEntity]),
    AuditModule,
    ArsipModule,
    TuVerifikasiModule,
  ],
  controllers: [PenyusutanController],
  providers: [PenyusutanService, TuGuard],
  exports: [PenyusutanService],
})
export class PenyusutanModule {}
