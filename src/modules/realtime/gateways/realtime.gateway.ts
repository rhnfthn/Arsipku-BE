import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RealtimeSyncService } from '../services/realtime-sync.service';

/**
 * RealtimeGateway
 *
 * Namespace: /realtime
 *
 * Tanggung jawab:
 * - Validasi JWT dari `client.handshake.auth.token`.
 * - Join room `position:<positionId>`, `user:<persnum>`, `role:<role>`,
 *   `company:<company>`, `area:<area>`.
 * - Emit event realtime sidebar (inbox count, label counts, BsrE alert,
 *   nomor counts, naskah dinas verifikator waiting count).
 *
 * Event server -> client:
 *  - realtime:summary        (initial + periodic full snapshot)
 *  - inbox:count             (inbox unread count change)
 *  - label:counts            (label count change)
 *  - bsre:alert              (BsrE alert toggle)
 *  - nomor:count             (nomor request count change)
 *  - naskah-dinas:verifikator-count (verifikator waiting count change)
 *  - naskah-lainnya:persetujuan-count (approval/signing queue count)
 *  - naskah-lainnya:legal-drafting-count (legal drafting queue count)
 *
 * Event client -> server:
 *  - realtime:subscribe      (request initial summary)
 *  - realtime:ping
 */
@WebSocketGateway({
  namespace: 'realtime',
  cors: {
    origin: (origin, callback) => {
      const allowed = process.env.WS_CORS_ORIGIN || '*';
      const list = allowed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!origin || list.includes('*') || list.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by WS CORS`));
      }
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly syncService: RealtimeSyncService,
  ) {}

  afterInit(_server: Server) {
    const enabled =
      (this.configService.get<string>('REALTIME_WS_ENABLED') ?? 'true') !==
      'false';
    if (!enabled) {
      this.logger.warn(
        '⚠️ RealtimeGateway DISABLED via REALTIME_WS_ENABLED=false',
      );
    }
    this.logger.log('✅ RealtimeGateway initialized (namespace: /realtime)');
  }

  async handleConnection(client: Socket) {
    try {
      const enabled =
        (this.configService.get<string>('REALTIME_WS_ENABLED') ?? 'true') !==
        'false';
      if (!enabled) {
        this.logger.warn(`Connection rejected (WS disabled): ${client.id}`);
        client.disconnect(true);
        return;
      }

      const rawToken =
        (client.handshake.auth?.token as string | undefined) ||
        client.handshake.headers?.authorization;

      if (!rawToken) {
        this.logger.warn(`Connection rejected (no token): ${client.id}`);
        client.disconnect(true);
        return;
      }

      const token = rawToken.startsWith('Bearer ')
        ? rawToken.slice(7)
        : rawToken;

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (!payload || !payload.position) {
        this.logger.warn(`Connection rejected (invalid payload): ${client.id}`);
        client.disconnect(true);
        return;
      }

      client.data.user = payload;

      const positionRoom = `position:${payload.position}`;
      client.join(positionRoom);

      if (payload.persnum != null) {
        client.join(`user:${payload.persnum}`);
      }
      if (payload.role) client.join(`role:${payload.role}`);
      if (payload.company) client.join(`company:${payload.company}`);
      if (payload.area) client.join(`area:${payload.area}`);

      this.logger.log(
        `🔌 Connected: ${client.id} -> position:${payload.position} user:${payload.persnum}`,
      );

      // Signal client that connection is established; FE will request summary
      client.emit('realtime:connected', { status: 'connected' });
    } catch (err: any) {
      this.logger.error(`❌ Connection error: ${err?.message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const u = client.data?.user as JwtPayload | undefined;
    this.logger.log(
      `❎ Disconnected: ${client.id} ${u ? `position:${u.position} user:${u.persnum}` : ''}`,
    );
  }

  @SubscribeMessage('realtime:ping')
  onPing(@ConnectedSocket() _client: Socket) {
    return { status: 'pong', ts: Date.now() };
  }

  @SubscribeMessage('realtime:subscribe')
  async onSubscribe(@ConnectedSocket() client: Socket) {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user?.position) return { status: 'error', message: 'No position' };
    // Fetch + emit initial summary ke client ini
    const summary = await this.syncService.sendInitialSummary(
      user.position,
      user.persnum,
    );
    if (summary) {
      // Emit hanya ke client ini, bukan ke seluruh room
      client.emit('realtime:summary', summary);
    }
    return { status: 'subscribed', positionId: user.position };
  }

  // ──────────────────────────────────────────────
  // Helper emit methods (dipanggil oleh RealtimeEmitService)
  // ──────────────────────────────────────────────

  /**
   * Emit full realtime summary snapshot ke satu position room.
   */
  emitRealtimeSummary(positionId: string, payload: any) {
    if (!this.server) return;
    this.server.to(`position:${positionId}`).emit('realtime:summary', payload);
  }

  /**
   * Emit inbox count change.
   */
  emitInboxCount(positionId: string, count: number) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('inbox:count', { positionId, count });
  }

  /**
   * Emit label counts change.
   */
  emitLabelCounts(positionId: string, counts: Record<string, number>) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('label:counts', { positionId, counts });
  }

  /**
   * Emit BsrE alert toggle — broadcast ke semua connected clients.
   */
  emitBsreAlert(payload: any) {
    if (!this.server) return;
    this.server.emit('bsre:alert', payload);
  }

  /**
   * Emit nomor request count change.
   */
  emitNomorCount(positionId: string, scope: 'admin' | 'user', counts: any) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('nomor:count', { positionId, scope, counts });
  }

  /**
   * Emit nomor request count change ke semua admin/superadmin.
   */
  emitNomorCountAdmin(counts: any) {
    if (!this.server) return;
    this.server
      .to('role:admin')
      .emit('nomor:count', { scope: 'admin', counts });
    this.server
      .to('role:superadmin')
      .emit('nomor:count', { scope: 'admin', counts });
  }

  /**
   * Emit naskah dinas verifikator waiting count change.
   */
  emitNaskahDinasVerifikatorCount(positionId: string, waiting: number) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('naskah-dinas:verifikator-count', { positionId, waiting });
  }

  /**
   * Emit naskah dinas verifikator waiting count change ke satu user (by persnum).
   */
  emitNaskahDinasVerifikatorCountUser(persnum: number, waiting: number) {
    if (!this.server) return;
    this.server
      .to(`user:${persnum}`)
      .emit('naskah-dinas:verifikator-count', { waiting });
  }

  /**
   * Emit naskah dinas verifikator waiting count change ke semua verifikator.
   * Dipakai saat status verifikasi berubah dan kita tidak tahu positionId spesifik.
   */
  emitNaskahDinasVerifikatorCountBroadcast(waiting: number) {
    if (!this.server) return;
    this.server.emit('naskah-dinas:verifikator-count', { waiting });
  }

  /**
   * Emit arsip-dinamis persetujuan waiting count change ke satu position.
   */
  emitArsipPersetujuanCount(positionId: string, waiting: number) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('arsip:persetujuan-count', { positionId, waiting });
  }

  /**
   * Emit arsip-dinamis persetujuan waiting count ke satu user (by persnum).
   */
  emitArsipPersetujuanCountUser(persnum: number, waiting: number) {
    if (!this.server) return;
    this.server
      .to(`user:${persnum}`)
      .emit('arsip:persetujuan-count', { waiting });
  }

  /**
   * Broadcast arsip-dinamis persetujuan waiting count ke semua client.
   */
  emitArsipPersetujuanCountBroadcast(waiting: number) {
    if (!this.server) return;
    this.server.emit('arsip:persetujuan-count', { waiting });
  }

  emitNaskahLainnyaPersetujuanCount(positionId: string, waiting: number) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('naskah-lainnya:persetujuan-count', { positionId, waiting });
  }

  emitNaskahLainnyaLegalDraftingCount(positionId: string, waiting: number) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('naskah-lainnya:legal-drafting-count', { positionId, waiting });
  }

  /**
   * Emit tracking update (read/follow-up status change) ke pengirim.
   */
  emitTrackingUpdate(pengirimPositionId: string, payload: any) {
    if (!this.server) return;
    this.server
      .to(`position:${pengirimPositionId}`)
      .emit('tracking:update', payload);
  }

  /**
   * Emit flag update (note/lock/favorit/arsip) ke position pemilik sirkulasi.
   */
  emitFlagUpdate(positionId: string, payload: any) {
    if (!this.server) return;
    this.server
      .to(`position:${positionId}`)
      .emit('flag:update', payload);
  }
}
