import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from '../gateways/realtime.gateway';

/**
 * RealtimeEmitService
 *
 * Single entry point untuk semua emit WebSocket realtime sidebar.
 * Service lain (NaskahSirkulasi, Label, BsreAlert, Nomor, NaskahDinas)
 * cukup inject service ini dan panggil method yang relevan.
 *
 * ⚠️ Service ini TIDAK menginject service data apapun untuk menghindari
 * circular dependency. Pemanggil bertanggung jawab menyediakan payload
 * (data sudah di-fetch oleh service yang melakukan perubahan).
 *
 * Untuk full summary (initial sync), gateway memanggil RealtimeSummaryService
 * secara langsung via RealtimeSyncService.
 */
@Injectable()
export class RealtimeEmitService {
  private readonly logger = new Logger(RealtimeEmitService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  // ──────────────────────────────────────────────
  // Full summary
  // ──────────────────────────────────────────────

  /**
   * Emit full realtime summary ke satu position.
   * Payload harus sudah berisi { inboxCount, labelCounts, bsreAlert, generatedAt }.
   */
  emitSummary(positionId: string, payload: any) {
    try {
      this.gateway.emitRealtimeSummary(positionId, payload);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitSummary] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // Inbox count
  // ──────────────────────────────────────────────

  /**
   * Emit inbox unread count change untuk satu position.
   */
  emitInboxCount(positionId: string, count: number) {
    try {
      this.gateway.emitInboxCount(positionId, count);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitInboxCount] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // Label counts
  // ──────────────────────────────────────────────

  /**
   * Emit label counts change untuk satu position.
   */
  emitLabelCounts(positionId: string, counts: Record<string, number>) {
    try {
      this.gateway.emitLabelCounts(positionId, counts);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitLabelCounts] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // BsrE alert
  // ──────────────────────────────────────────────

  /**
   * Emit BsrE alert status change — broadcast ke semua client.
   */
  emitBsreAlert(payload: any) {
    try {
      this.gateway.emitBsreAlert(payload);
    } catch (err: any) {
      this.logger.warn(`⚠️ [emitBsreAlert] failed: ${err?.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // Nomor counts
  // ──────────────────────────────────────────────

  /**
   * Emit nomor count change untuk satu position (user scope).
   */
  emitNomorCountUser(positionId: string, counts: any) {
    try {
      this.gateway.emitNomorCount(positionId, 'user', counts);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNomorCountUser] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  /**
   * Emit nomor count change ke semua admin/superadmin.
   */
  emitNomorCountAdminBroadcast(counts: any) {
    try {
      this.gateway.emitNomorCountAdmin(counts);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNomorCountAdminBroadcast] failed: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // Naskah Dinas Verifikator count
  // ──────────────────────────────────────────────

  /**
   * Emit naskah dinas verifikator waiting count change ke satu position.
   */
  emitNaskahDinasVerifikatorCount(positionId: string, waiting: number) {
    try {
      this.gateway.emitNaskahDinasVerifikatorCount(positionId, waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNaskahDinasVerifikatorCount] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  /**
   * Emit naskah dinas verifikator waiting count ke satu user (by persnum).
   */
  emitNaskahDinasVerifikatorCountUser(persnum: number, waiting: number) {
    try {
      this.gateway.emitNaskahDinasVerifikatorCountUser(persnum, waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNaskahDinasVerifikatorCountUser] failed for persnum ${persnum}: ${err?.message}`,
      );
    }
  }

  /**
   * Broadcast naskah dinas verifikator waiting count ke semua client.
   */
  emitNaskahDinasVerifikatorCountBroadcast(waiting: number) {
    try {
      this.gateway.emitNaskahDinasVerifikatorCountBroadcast(waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNaskahDinasVerifikatorCountBroadcast] failed: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // Arsip Dinamis Persetujuan count
  // ──────────────────────────────────────────────

  /**
   * Emit arsip-dinamis persetujuan waiting count ke satu position.
   */
  emitArsipPersetujuanCount(positionId: string, waiting: number) {
    try {
      this.gateway.emitArsipPersetujuanCount(positionId, waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitArsipPersetujuanCount] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  /**
   * Emit arsip-dinamis persetujuan waiting count ke satu user (by persnum).
   */
  emitArsipPersetujuanCountUser(persnum: number, waiting: number) {
    try {
      this.gateway.emitArsipPersetujuanCountUser(persnum, waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitArsipPersetujuanCountUser] failed for persnum ${persnum}: ${err?.message}`,
      );
    }
  }

  /**
   * Broadcast arsip-dinamis persetujuan waiting count ke semua client.
   */
  emitArsipPersetujuanCountBroadcast(waiting: number) {
    try {
      this.gateway.emitArsipPersetujuanCountBroadcast(waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitArsipPersetujuanCountBroadcast] failed: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // Naskah Lainnya queues
  // ──────────────────────────────────────────────

  emitNaskahLainnyaPersetujuanCount(positionId: string, waiting: number) {
    try {
      this.gateway.emitNaskahLainnyaPersetujuanCount(positionId, waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNaskahLainnyaPersetujuanCount] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  emitNaskahLainnyaLegalDraftingCount(positionId: string, waiting: number) {
    try {
      this.gateway.emitNaskahLainnyaLegalDraftingCount(positionId, waiting);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [emitNaskahLainnyaLegalDraftingCount] failed for ${positionId}: ${err?.message}`,
      );
    }
  }

  // ──────────────────────────────────────────────
  // Tracking update (read status / tindak lanjut)
  // ──────────────────────────────────────────────

  /**
   * Emit tracking update ke pengirim saat penerima membaca atau tindak lanjut.
   */
  emitTrackingUpdate(
    pengirimPositionId: string,
    payload: {
      naskahId: string;
      sirkulasiId: string;
      positionId: string;
      status_baca: string;
      read_time: string | null;
      is_tindak_lanjut: boolean;
    },
  ) {
    try {
      this.gateway.emitTrackingUpdate(pengirimPositionId, payload);
    } catch (err: any) {
      this.logger.warn(`⚠️ [emitTrackingUpdate] failed: ${err?.message}`);
    }
  }

  /**
   * Emit flag update (note/lock/favorit/arsip) ke position pemilik sirkulasi.
   * Dipakai agar web & mobile sinkron realtime saat flag di-toggle.
   */
  emitFlagUpdate(
    positionId: string,
    payload: {
      id_sirkulasi: string;
      flag_type: string;
      new_value: boolean;
      note_text?: string | null;
    },
  ) {
    try {
      this.gateway.emitFlagUpdate(positionId, payload);
    } catch (err: any) {
      this.logger.warn(`⚠️ [emitFlagUpdate] failed: ${err?.message}`);
    }
  }
}
