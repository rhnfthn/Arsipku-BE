import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAiConfig } from '../entities/user-ai-config.entity';

export interface AiConfigPublic {
  hasKey: boolean;
  keyMasked: string | null;
}

@Injectable()
export class UserAiConfigService {
  constructor(
    @InjectRepository(UserAiConfig)
    private readonly repo: Repository<UserAiConfig>,
  ) {}

  /** Return raw key for AI calls, or null if user has none (caller falls back to env). */
  async getApiKey(persnum: number): Promise<string | null> {
    const row = await this.repo.findOne({ where: { persnum } });
    if (!row || !row.ai_api_key) return null;
    return row.ai_api_key;
  }

  /** Public-safe view for the settings page — never exposes the raw key. */
  async getMasked(persnum: number): Promise<AiConfigPublic> {
    const key = await this.getApiKey(persnum);
    if (!key) return { hasKey: false, keyMasked: null };
    return { hasKey: true, keyMasked: this.mask(key) };
  }

  /** Insert/update key. Empty string clears (sets NULL). */
  async upsert(persnum: number, apiKey: string): Promise<void> {
    const trimmed = (apiKey ?? '').trim();
    const value = trimmed === '' ? null : trimmed;
    const existing = await this.repo.findOne({ where: { persnum } });
    if (existing) {
      existing.ai_api_key = value;
      await this.repo.save(existing);
      return;
    }
    await this.repo.insert({ persnum, ai_api_key: value });
  }

  private mask(key: string): string {
    if (key.length <= 4) return '****';
    return `****${key.slice(-4)}`;
  }
}