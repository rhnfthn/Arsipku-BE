import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiLogService } from '../services/ai-log.service';
import { RbacService } from '../../rbac/services/rbac.service';
import { NaskahTypeEnum } from '../dto/generate-draft.dto';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Map naskahType → RBAC resource name untuk permission `generate-ai`.
 */
const NASKAH_TYPE_TO_RESOURCE: Record<NaskahTypeEnum, string> = {
  [NaskahTypeEnum.ND]: 'utama.tulis.nota-dinas',
  [NaskahTypeEnum.SDI]: 'utama.tulis.surat-dinas-internal',
  [NaskahTypeEnum.SDE]: 'utama.tulis.surat-dinas-eksternal',
  [NaskahTypeEnum.KAJIAN]: 'utama.tulis.kajian',
  [NaskahTypeEnum.DISPOSISI]: 'utama.tulis.disposisi',
};

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(
    private readonly logService: AiLogService,
    private readonly config: ConfigService,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      body?: { naskahType?: NaskahTypeEnum };
    }>();
    const persnum: number | undefined = request.user?.persnum;
    if (!persnum) return true; // JwtAuthGuard (global) will reject unauthenticated

    // ── Permission check: generate-ai per naskahType ──
    const naskahType = request.body?.naskahType;
    if (naskahType && NASKAH_TYPE_TO_RESOURCE[naskahType]) {
      const resource = NASKAH_TYPE_TO_RESOURCE[naskahType];
      const { activePermissions } =
        await this.rbacService.buildActiveRoleAndPermissions(persnum);
      const allowed = activePermissions.some(
        (p) => p.resource === resource && p.actions.includes('generate-ai'),
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Anda tidak memiliki izin untuk generate AI draft pada naskah ini',
        );
      }
    }

    // ── Rate limit check ──
    const limit = Number(this.config.get('AI_RATE_LIMIT_DAILY') ?? 10);
    const used = await this.logService.countTodaySuccess(persnum);
    if (used >= limit) {
      throw new HttpException('Kuota harian generate draft AI habis', 429);
    }
    return true;
  }
}
