import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsulanPindahArsipInaktifEntity } from './entities/usulan-pindah.entity';
import { UsulanPindahService } from './services/usulan-pindah.service';
import { UsulanPindahController } from './controllers/usulan-pindah.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * Module Usulan Pindah Arsip Inaktif.
 *
 * Mengimpor AuditModule untuk akses AuditTrailService (fire-and-forget logging).
 * NotificationService bersifat @Global() (dari NotificationModule) → tidak perlu
 * import eksplisit di sini.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UsulanPindahArsipInaktifEntity]),
    AuditModule,
  ],
  controllers: [UsulanPindahController],
  providers: [UsulanPindahService],
  exports: [UsulanPindahService],
})
export class UsulanPindahModule {}
