import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { RealtimeEmitService } from './services/realtime-emit.service';
import { RealtimeSyncService } from './services/realtime-sync.service';
import { AuthModule } from '../auth/auth.module';

/**
 * RealtimeModule
 *
 * Global module — RealtimeEmitService & RealtimeGateway tersedia di seluruh app.
 *
 * TIDAK mengimport DashboardModule. RealtimeSyncService me-resolve
 * RealtimeSummaryService secara lazy via ModuleRef untuk menghindari
 * circular dependency:
 *   RealtimeSyncService → RealtimeSummaryService → BsreAlertService
 *   → RealtimeEmitService → RealtimeGateway → RealtimeSyncService
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeEmitService, RealtimeSyncService],
  exports: [RealtimeGateway, RealtimeEmitService],
})
export class RealtimeModule {}