import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Session } from '../entities/session.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
  ) {}

  /**
   * Create new session for user device
   */
  async createSession(
    userPersnum: number,
    data: {
      airnavAccessToken: string;
      airnavRefreshToken: string;
      airnavExpiredAt: Date;
      idPosition?: number;
      userAgent?: string;
      ipAddress?: string;
    },
  ): Promise<Session> {
    console.log('[SessionService] Creating session with data:', {
      userPersnum,
      idPosition: data.idPosition,
      hasAccessToken: !!data.airnavAccessToken,
      hasRefreshToken: !!data.airnavRefreshToken,
    });

    const session = this.sessionRepo.create({
      id: uuid(),
      userPersnum,
      ...data,
    });

    console.log('[SessionService] Session object before save:', {
      id: session.id,
      userPersnum: session.userPersnum,
      idPosition: session.idPosition,
    });

    const saved = await this.sessionRepo.save(session);

    console.log('[SessionService] Session saved:', {
      id: saved.id,
      userPersnum: saved.userPersnum,
      idPosition: saved.idPosition,
    });

    return saved;
  }

  /**
   * Find session by ID
   */
  async findSession(sessionId: string): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { id: sessionId },
    });
  }

  /**
   * Update session (after refresh)
   */
  async updateSession(
    sessionId: string,
    data: Partial<{
      airnavAccessToken: string;
      airnavRefreshToken: string;
      airnavExpiredAt: Date;
    }>,
  ): Promise<void> {
    await this.sessionRepo.update({ id: sessionId }, data);
  }

  /**
   * Rotasi refresh token bersifat single-use. Compare-and-swap mencegah dua
   * request paralel menyimpan pasangan token yang berbeda untuk sesi sama.
   */
  async rotateOidcTokens(
    sessionId: string,
    previousRefreshToken: string,
    data: {
      airnavAccessToken: string;
      airnavRefreshToken: string;
      airnavExpiredAt: Date;
    },
  ): Promise<boolean> {
    const result = await this.sessionRepo.update(
      { id: sessionId, airnavRefreshToken: previousRefreshToken },
      data,
    );
    return result.affected === 1;
  }

  /**
   * Delete expired sessions (cleanup)
   */
  async deleteExpiredSessions(): Promise<void> {
    await this.sessionRepo.delete({
      airnavExpiredAt: LessThan(new Date()),
    });
  }

  /**
   * Delete session by ID (logout)
   */
  async deleteSessionById(sessionId: string): Promise<void> {
    await this.sessionRepo.delete({ id: sessionId });
  }

  /**
   * Delete all sessions for user (revoke all devices)
   */
  async deleteAllUserSessions(persnum: number): Promise<void> {
    await this.sessionRepo.delete({ userPersnum: persnum });
  }
}
