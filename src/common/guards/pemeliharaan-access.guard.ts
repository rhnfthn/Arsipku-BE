import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PEMELIHARAAN_ACCESS_KEY } from '../decorators/pemeliharaan-access.decorator';
import {
  getEffectivePemeliharaanRole,
  PemeliharaanAccess,
} from '../helpers/pemeliharaan-access.helper';
import { normalizeRoleName, RoleName } from '../enums/role-name.enum';
import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

@Injectable()
export class PemeliharaanAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      PemeliharaanAccess[] | undefined
    >(PEMELIHARAAN_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const user: JwtPayload | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('User not authenticated');

    const role = normalizeRoleName(user?.activeRole?.name ?? user?.role);
    if (role === RoleName.ADMIN || role === RoleName.SUPERADMIN) return true;

    const effective = getEffectivePemeliharaanRole(user.position_status, user.bodTag);
    if (effective && required.includes(effective)) return true;

    throw new ForbiddenException(
      `Akses pemeliharaan memerlukan aktor: ${required.join(', ')}. ` +
        `Level efektif Anda: ${effective ?? 'tidak berlaku'}.`,
    );
  }
}
