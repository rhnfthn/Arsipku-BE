import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * NotificationGateway
 *
 * Namespace: /notifications
 *
 * Tanggung jawab:
 * - Validasi JWT dari `client.handshake.auth.token`.
 * - Join room `position:<positionId>` dan `user:<persnum>`.
 * - Emit event realtime notification ke room yang relevan.
 *
 * Event server -> client:
 *  - notification:new
 *  - notification:count
 *  - notification:read
 *  - notification:read-all
 *  - notification:deleted
 *  - notification:sync
 *
 * Event client -> server:
 *  - notification:subscribe
 *  - notification:ping
 */
@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: (origin, callback) => {
      // Ambil allowed origin dari env WS_CORS_ORIGIN (boleh comma separated)
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
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    const enabled =
      (this.configService.get<string>('NOTIFICATION_WS_ENABLED') ?? 'true') !==
      'false';
    if (!enabled) {
      this.logger.warn(
        '⚠️ NotificationGateway DISABLED via NOTIFICATION_WS_ENABLED=false',
      );
    }
    this.logger.log(
      '✅ NotificationGateway initialized (namespace: /notifications)',
    );
  }

  /**
   * Validasi token saat handshake.
   * Token dikirim via `auth.token` (Socket.IO v3+).
   */
  async handleConnection(client: Socket) {
    try {
      const enabled =
        (this.configService.get<string>('NOTIFICATION_WS_ENABLED') ??
          'true') !== 'false';
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

      // Simpan payload di client.data untuk referensi
      client.data.user = payload;

      // Join room position & user
      const positionRoom = `position:${payload.position}`;
      client.join(positionRoom);

      if (payload.persnum != null) {
        const userRoom = `user:${payload.persnum}`;
        client.join(userRoom);
      }

      // Optional role/company/area room
      if (payload.role) {
        client.join(`role:${payload.role}`);
      }
      if (payload.company) {
        client.join(`company:${payload.company}`);
      }
      if (payload.area) {
        client.join(`area:${payload.area}`);
      }

      this.logger.log(
        `🔌 Connected: ${client.id} -> position:${payload.position} user:${payload.persnum}`,
      );

      // Emit sync awal (FE akan fetch REST sendiri)
      client.emit('notification:sync', { status: 'connected' });
    } catch (err: any) {
      this.logger.error(`❌ Connection error: ${err?.message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const u = client.data?.user as JwtPayload | undefined;
    this.logger.log(
      `❎ Disconnected: ${client.id} ${
        u ? `position:${u.position} user:${u.persnum}` : ''
      }`,
    );
  }

  /**
   * Client ping untuk keep-alive / health check.
   */
  @SubscribeMessage('notification:ping')
  onPing(@ConnectedSocket() client: Socket) {
    return { status: 'pong', ts: Date.now() };
  }

  // ============================================================
  // Helper emit methods (dipanggil oleh NotificationService)
  // ============================================================

  /**
   * Emit notifikasi baru ke room position & user.
   */
  emitNewNotification(
    positionId: string,
    userPersnum: number | null | undefined,
    notification: any,
  ) {
    if (!this.server) return;

    const positionRoom = `position:${positionId}`;
    const emitter = this.server.to(positionRoom);
    if (userPersnum != null) emitter.to(`user:${userPersnum}`);
    // Socket.IO melakukan union room: client yang join kedua room tetap
    // menerima satu event, bukan dua event yang sama.
    emitter.emit('notification:new', notification);
  }

  /**
   * Emit unread count terbaru ke room position & user.
   */
  emitUnreadCount(
    positionId: string,
    userPersnum: number | null | undefined,
    count: number,
    sdeMasalCount = 0,
  ) {
    if (!this.server) return;

    const payload = { positionId, count, sdeMasalCount };
    this.server
      .to(`position:${positionId}`)
      .emit('notification:count', payload);

    if (userPersnum != null) {
      this.server.to(`user:${userPersnum}`).emit('notification:count', payload);
    }
  }

  /**
   * Emit event mark read untuk satu notification.
   */
  emitRead(
    positionId: string,
    userPersnum: number | null | undefined,
    notificationId: string,
  ) {
    if (!this.server) return;

    const payload = { positionId, notificationId };
    this.server.to(`position:${positionId}`).emit('notification:read', payload);

    if (userPersnum != null) {
      this.server.to(`user:${userPersnum}`).emit('notification:read', payload);
    }
  }

  /**
   * Emit event mark all read.
   */
  emitReadAll(positionId: string, userPersnum: number | null | undefined) {
    if (!this.server) return;

    const payload = { positionId };
    this.server
      .to(`position:${positionId}`)
      .emit('notification:read-all', payload);

    if (userPersnum != null) {
      this.server
        .to(`user:${userPersnum}`)
        .emit('notification:read-all', payload);
    }
  }

  /**
   * Emit event deleted.
   */
  emitDeleted(
    positionId: string,
    userPersnum: number | null | undefined,
    notificationId: string,
  ) {
    if (!this.server) return;

    const payload = { positionId, notificationId };
    this.server
      .to(`position:${positionId}`)
      .emit('notification:deleted', payload);

    if (userPersnum != null) {
      this.server
        .to(`user:${userPersnum}`)
        .emit('notification:deleted', payload);
    }
  }

  /**
   * Emit RBAC role change ke user tertentu (real-time role update tanpa relog).
   * Dipanggil saat superadmin assign/remove role ke user lain.
   */
  emitRbacRoleChanged(
    persnum: number,
    data: { action: string; roleName?: string },
  ) {
    if (!this.server) return;
    this.logger.log(
      `📢 Emit rbac:role-changed to user:${persnum} — ${data.action}`,
    );
    this.server
      .to(`user:${persnum}`)
      .emit('rbac:role-changed', { persnum, ...data });
  }

  /**
   * Emit RBAC permission change ke semua user dengan role tertentu.
   * Dipanggil saat superadmin edit permission suatu role (propagasi ke semua pemilik role).
   */
  emitRbacPermissionChanged(roleName: string, data: { roleId: string }) {
    if (!this.server) return;
    const lowerRole = roleName.toLowerCase();
    this.logger.log(
      `📢 Emit rbac:permission-changed to role:${lowerRole} — ${data.roleId}`,
    );
    this.server
      .to(`role:${lowerRole}`)
      .emit('rbac:permission-changed', { roleName, ...data });
  }
}
