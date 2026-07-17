import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiLogService } from '../services/ai-log.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(
    private readonly logService: AiLogService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const persnum: number | undefined = request.user?.persnum;
    if (!persnum) return true; // JwtAuthGuard (global) will reject unauthenticated

    const limit = Number(this.config.get('AI_RATE_LIMIT_DAILY') ?? 10);
    const used = await this.logService.countTodaySuccess(persnum);
    if (used >= limit) {
      throw new HttpException('Kuota harian generate draft AI habis', 429);
    }
    return true;
  }
}
