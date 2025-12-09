import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  /** Create session baru per device */
  async createSession(
    userPersnum: number,
    data: {
      airnavAccessToken: string;
      airnavRefreshToken: string;
      airnavExpiredAt: Date;
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    return this.prisma.userSsoSession.create({
      data: {
        // id: crypto.randomUUID(),
        userPersnum,
        ...data,
      },
    });
  }

  /** Ambil session berdasarkan sessionId */
  async findSession(sessionId: string) {
    return this.prisma.userSsoSession.findUnique({
      where: { id: sessionId },
    });
  }

  /** Update session setelah refresh */
  async updateSession(
    sessionId: string,
    data: Partial<{
      airnavAccessToken: string;
      airnavRefreshToken: string;
      airnavExpiredAt: Date;
    }>,
  ) {
    return this.prisma.userSsoSession.update({
      where: { id: sessionId },
      data,
    });
  }

  /** Lazy delete kalau expired */
  async deleteExpiredSessions() {
    await this.prisma.userSsoSession.deleteMany({
      where: {
        airnavExpiredAt: { lt: new Date() },
      },
    });
  }

  async deleteSessionById(sessionId: string) {
    await this.prisma.userSsoSession.deleteMany({
      where: { id: sessionId },
    });
  }
}
