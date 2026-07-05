import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiRequestLog } from '../entities/ai-request-log.entity';

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|authorization|cookie|password|passwd|secret|token)/i;

@Injectable()
export class AiLogService {
  private readonly logger = new Logger(AiLogService.name);

  constructor(
    @InjectRepository(AiRequestLog)
    private readonly repo: Repository<AiRequestLog>,
  ) {}

  async log(entry: Partial<AiRequestLog>): Promise<void> {
    try {
      const safe: Partial<AiRequestLog> = { ...entry };
      if (safe.request_body_redacted) {
        safe.request_body_redacted = this.redactJson(safe.request_body_redacted);
      }
      await this.repo.insert(safe as any);
    } catch (err) {
      this.logger.error(`audit log write failed: ${err}`);
    }
  }

  async countTodaySuccess(persnum: number): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('log')
      .select('COUNT(*)', 'cnt')
      .where('log.persnum = :persnum', { persnum })
      .andWhere('log.status_code = 200')
      .andWhere('DATE(log.created_at) = CURDATE()')
      .getRawOne();
    return Number(row?.cnt ?? 0);
  }

  private redactJson(jsonStr: string): string {
    try {
      const obj = JSON.parse(jsonStr);
      const redacted = this.redactObject(obj);
      return JSON.stringify(redacted);
    } catch {
      // not JSON; return as-is
      return jsonStr;
    }
  }

  private redactObject(obj: any): any {
    if (Array.isArray(obj)) return obj.map((v) => this.redactObject(v));
    if (obj && typeof obj === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : this.redactObject(v);
      }
      return out;
    }
    return obj;
  }
}
