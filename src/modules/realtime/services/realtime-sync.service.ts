import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { REALTIME_SUMMARY_SERVICE } from '../../dashboard/realtime-summary.token';

interface RealtimeSummaryProvider {
  invalidate(positionId?: string): void;
  getSummary(positionId: string, persnum?: number): Promise<any>;
}

/**
 * RealtimeSyncService
 *
 * Menangani initial sync: saat client connect dan request summary,
 * service ini fetch data dari RealtimeSummaryService secara lazy.
 *
 * ⚠️ RealtimeSummaryService di-resolve LAZY via ModuleRef.get() untuk
 * menghindari circular dependency pada constructor injection:
 *   RealtimeSyncService → RealtimeSummaryService → BsreAlertService
 *   → RealtimeEmitService → RealtimeGateway → RealtimeSyncService
 *
 * Token provider dipakai agar file ini tidak perlu static import
 * RealtimeSummaryService, karena static import membuat circular dependency.
 */
@Injectable()
export class RealtimeSyncService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeSyncService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    this.logger.log('✅ RealtimeSyncService initialized');
  }

  /**
   * Fetch full summary untuk satu position.
   * Dipanggil saat client emit 'realtime:subscribe'.
   */
  async sendInitialSummary(positionId: string, persnum?: number) {
    try {
      const summaryService = this.moduleRef.get<RealtimeSummaryProvider>(
        REALTIME_SUMMARY_SERVICE,
        {
          strict: false,
        },
      );
      if (!summaryService) {
        this.logger.warn(`RealtimeSummaryService not available yet`);
        return null;
      }
      summaryService.invalidate(positionId);
      return await summaryService.getSummary(positionId, persnum);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [sendInitialSummary] failed for ${positionId}: ${err?.message}`,
      );
      return null;
    }
  }
}
