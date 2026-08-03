import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ArsipDinamisService } from './arsip-dinamis.service';

/**
 * Scheduled job: auto-close berkas whose active retention period has expired.
 *
 * Runs daily at 2 AM as a safety net. The same evaluation also runs on-demand
 * (tutupBerkasRetensiHabis) on every retention read path, so status updates
 * immediately without waiting for the cron.
 *
 * Transitions: aktif → closed_retensi_aktif + creates berkas_riwayat_retensi record.
 * This makes the berkas eligible for the "transfer to inaktif" feature.
 */
@Injectable()
export class RetensiSchedulerService {
  private readonly logger = new Logger(RetensiSchedulerService.name);

  constructor(
    private readonly arsipDinamisService: ArsipDinamisService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async autoCloseExpiredRetensi(): Promise<number> {
    this.logger.log('Cek berkas dengan masa retensi aktif habis...');
    const count = await this.arsipDinamisService.tutupBerkasRetensiHabis();
    if (count === 0) {
      this.logger.log('Tidak ada berkas dengan retensi habis.');
    } else {
      this.logger.log(`Auto-close selesai: ${count} berkas ditutup.`);
    }
    return count;
  }
}
