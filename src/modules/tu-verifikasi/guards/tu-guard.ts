import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

/**
 * Guard untuk endpoint TU (Unit Dokumen).
 * Mengizinkan akses hanya jika user memiliki role 'tu' di tuRoles (dari organization_tu)
 * atau role SUPERADMIN/ADMIN.
 * Skip guard jika route marked dengan @Public().
 */
@Injectable()
export class TuGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip jika route public (mis. endpoint foto penataan)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User tidak terautentikasi');
    }

    // Superadmin/Admin selalu diizinkan
    const role = (user.role || '').toUpperCase();
    if (role === 'SUPERADMIN' || role === 'ADMIN') {
      return true;
    }

    // Cek tuRoles dari JWT (dari organization_tu)
    const tuRoles: string[] = Array.isArray(user.tuRoles) ? user.tuRoles : [];
    if (tuRoles.includes('tu')) {
      return true;
    }

    throw new ForbiddenException('Akses hanya untuk Unit Tata Naskah (TU)');
  }
}
