import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import type { OidcServerSession } from '../interfaces/oidc.interface';

@Injectable()
export class OidcSessionService {
  private readonly prefix: string;
  private readonly ttlMs: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    configService: ConfigService,
  ) {
    this.prefix = configService.get<string>(
      'REDIS_KEY_PREFIX',
      'arsipku:auth:v2:',
    );
    const configuredTtl = Number(
      configService.get<string>('AUTH_SESSION_TTL_SECONDS', '28800'),
    );
    this.ttlMs =
      (Number.isFinite(configuredTtl) && configuredTtl > 0
        ? configuredTtl
        : 28800) * 1000;
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  async create(sessionId: string, session: OidcServerSession): Promise<void> {
    await this.cache.set(this.key(sessionId), session, this.ttlMs);
  }

  async get(sessionId: string): Promise<OidcServerSession | null> {
    return (
      (await this.cache.get<OidcServerSession>(this.key(sessionId))) ?? null
    );
  }

  async update(sessionId: string, session: OidcServerSession): Promise<void> {
    await this.cache.set(this.key(sessionId), session, this.ttlMs);
  }

  async delete(sessionId: string): Promise<void> {
    await this.cache.del(this.key(sessionId));
  }
}
