import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditTrail, AuditTrailSchema } from './schemas/audit-trail.schema';
import {
  AuditAnomaly,
  AuditAnomalySchema,
} from './schemas/audit-anomaly.schema';
import { AuditTrailService } from './services/audit-trail.service';
import { AuditAnomalyService } from './services/audit-anomaly.service';
import { AuditTrailController } from './controllers/audit-trail.controller';
import { AuditAnomalyController } from './controllers/audit-anomaly.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';

/**
 * Module Audit Trail — koneksi database MongoDB `arsipku_audit`.
 *
 * Menggunakan MongooseModule.forFeature dengan schema AuditTrail & AuditAnomaly.
 * Koneksi Mongoose didaftarkan di AppModule (MongooseModule.forRootAsync).
 *
 * Mengekspor AuditTrailService & AuditAnomalyService agar bisa dipakai modul lain
 * (mis. AuthModule, RbacModule) untuk logging manual tanpa mengubah kode lama.
 *
 * AuditInterceptor didaftarkan sebagai APP_INTERCEPTOR global agar semua
 * write operation (POST/PATCH/PUT/DELETE) otomatis tercatat tanpa perlu
 * memasang @AuditLog() di setiap controller method.
 */
@Module({
  // forFeature mengikuti konfigurasi koneksi di AppModule.
  // Saat nonaktif, model di-inject @Optional() sehingga service jadi no-op.
  imports: [
    ...(process.env.MONGODB_ENABLED !== 'false' && process.env.MONGODB_URI
      ? [
          MongooseModule.forFeature([
            { name: AuditTrail.name, schema: AuditTrailSchema },
            { name: AuditAnomaly.name, schema: AuditAnomalySchema },
          ]),
        ]
      : []),
  ],
  controllers: [AuditTrailController, AuditAnomalyController],
  providers: [
    AuditTrailService,
    AuditAnomalyService,
    AuditInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditTrailService, AuditAnomalyService, AuditInterceptor],
})
export class AuditModule {}
