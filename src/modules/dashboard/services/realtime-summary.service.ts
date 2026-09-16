import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { NaskahSirkulasiService } from 'src/modules/naskah-sirkulasi/services/naskah_sirkulasi.service';
import { LabelService } from 'src/modules/label/services/label.service';
import { BsreAlertService } from 'src/modules/digsig/services/bsre-alert.service';
import { NaskahDinasVerifikatorEntity } from 'src/modules/naskah-dinas/entities/naskah-dinas-verifikator.entity';
import { NomorService } from 'src/modules/nomor/services/nomor.service';
import { NaskahLainnyaService } from 'src/modules/naskah-lainnya/services/naskah-lainnya.service';
import { TugasAccessReader } from 'src/modules/tugas/services/tugas-access.reader';

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
    private readonly dataSource: DataSource,
    private readonly naskahLainnyaService: NaskahLainnyaService,
    // Lazy resolve via ModuleRef — menghindari circular dependency
    // DashboardModule ↔ TugasModule (pola sama dengan RealtimeSyncService).
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Resolve TugasAccessReader secara lazy; null bila modul belum siap. */
  private get tugasAccessReader(): TugasAccessReader | null {
    try {
      return this.moduleRef.get(TugasAccessReader, { strict: false }) ?? null;
    } catch {
      return null;
    }
  }

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
      arsipPersetujuanWaitingCount,
      naskahLainnyaPersetujuanWaitingCount,
      naskahLainnyaLegalDraftingWaitingCount,
      tugasAssignedWaitingCount,
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
      persnum != null
        ? this.dataSource
            .query(
              `SELECT COUNT(*) AS total FROM berkas_verifikasi bv
               INNER JOIN berkas b ON b.id = bv.berkas_id
               WHERE bv.verifikator_persnum = ? AND b.deleted_at IS NULL
                 AND bv.status = 'pending' AND b.status = 'menunggu_verifikasi'
                 AND NOT EXISTS (SELECT 1 FROM berkas_verifikasi earlier
                                 WHERE earlier.berkas_id = bv.berkas_id
                                   AND earlier.status = 'pending'
                                   AND earlier.urutan < bv.urutan)`,
              [String(persnum)],
            )
            .then((r: any) => Number(r?.[0]?.total || 0))
            .catch(() => 0)
        : Promise.resolve(0),
      this.naskahLainnyaService
        .getPersetujuan(
          {
            position: String(positionId),
            positionId: String(positionId),
            persnum: persnum ?? 0,
            nama: '',
          },
          'menunggu',
        )
        .then((result: any) =>
          Array.isArray(result?.data) ? result.data.length : 0,
        )
        .catch(() => 0),
      this.naskahLainnyaService
        .getLegalDrafting(
          {
            position: String(positionId),
            positionId: String(positionId),
            persnum: persnum ?? 0,
            nama: '',
          },
          'belum-dikirim',
        )
        .then((result: any) =>
          Array.isArray(result?.data)
            ? result.data.filter((item: any) =>
                ['belum_dikirim', 'revisi'].includes(item.statusLegal),
              ).length
            : 0,
        )
        .catch(() => 0),
      // Tugas: task aktif yang ditugaskan ke posisi ini dan belum done.
      // Count hanya task aktif, board tidak terhapus, task tidak archived.
      this.tugasAccessReader
        ? this.tugasAccessReader
            .countAssignedOpenByPosition(String(positionId))
            .catch(() => 0)
        : Promise.resolve(0),
    ]);

    const data = {
      inboxCount,
      labelCounts,
      bsreAlert,
      naskahDinasVerifikatorWaitingCount: verifikatorWaitingCount,
      arsipPersetujuanWaitingCount,
      naskahLainnyaPersetujuanWaitingCount,
      naskahLainnyaLegalDraftingWaitingCount,
      tugasAssignedWaitingCount,
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
      const prefix = `realtime:${positionId}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }
}
