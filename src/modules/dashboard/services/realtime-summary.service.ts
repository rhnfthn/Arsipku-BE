import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahSirkulasiService } from 'src/modules/naskah-sirkulasi/services/naskah_sirkulasi.service';
import { LabelService } from 'src/modules/label/services/label.service';
import { BsreAlertService } from 'src/modules/digsig/services/bsre-alert.service';
import { NaskahDinasVerifikatorEntity } from 'src/modules/naskah-dinas/entities/naskah-dinas-verifikator.entity';
import { NomorService } from 'src/modules/nomor/services/nomor.service';

interface CacheEntry {
  data: any;
  expires: number;
}

const CACHE_TTL_MS = 15_000; // 15 detik
const MAX_CACHE_ENTRIES = 5_000;

/**
 * Endpoint agregat untuk polling realtime sidebar.
 * Mengembalikan inbox count + label counts + bsre alert
 * dalam satu HTTP request, dengan in-memory cache 15s per user.
 */
@Injectable()
export class RealtimeSummaryService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly sirkulasiService: NaskahSirkulasiService,
    private readonly labelService: LabelService,
    private readonly bsreAlertService: BsreAlertService,
    private readonly nomorService: NomorService,
    @InjectRepository(NaskahDinasVerifikatorEntity)
    private readonly verifikatorRepository: Repository<NaskahDinasVerifikatorEntity>,
  ) {}

  async getSummary(positionId: string, persnum?: number) {
    const cacheKey = `realtime:${positionId}:${persnum ?? 'all'}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > now) {
      return { ...cached.data, cached: true };
    }

    const [
      inboxCount,
      labelCounts,
      bsreAlert,
      verifikatorWaitingCount,
      nomorAdminCount,
      nomorUserCount,
    ] = await Promise.all([
      this.sirkulasiService.countUnreadInbox(positionId).catch(() => null),
      this.labelService.countNaskahPerLabel(positionId).catch(() => ({})),
      this.bsreAlertService.getAlertStatus().catch(() => null),
      persnum != null
        ? this.verifikatorRepository
            .count({ where: { persnum, status: 'waiting' } })
            .catch(() => 0)
        : this.verifikatorRepository
            .count({ where: { status: 'waiting' } })
            .catch(() => 0),
      this.nomorService
        .getAdminCountNomorRequest(Number(positionId))
        .catch(() => null),
      this.nomorService
        .getAdminCountNomorRequestByPosition(Number(positionId))
        .catch(() => null),
    ]);

    const data = {
      inboxCount,
      labelCounts,
      bsreAlert,
      naskahDinasVerifikatorWaitingCount: verifikatorWaitingCount,
      nomorCounts: {
        admin: nomorAdminCount?.data ?? null,
        user: nomorUserCount?.data ?? null,
      },
      generatedAt: new Date().toISOString(),
    };

    // Simple LRU-ish: clear if over limit
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      this.cache.clear();
    }

    this.cache.set(cacheKey, {
      data,
      expires: now + CACHE_TTL_MS,
    });

    return { ...data, cached: false };
  }

  /** Invalidate manual (dipakai saat ada update yang harus reflect cepat) */
  invalidate(positionId?: string) {
    if (positionId) {
      this.cache.delete(`realtime:${positionId}`);
    } else {
      this.cache.clear();
    }
  }
}
