import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard untuk endpoint TU (Unit Dokumen).
 * Mengizinkan akses hanya jika user memiliki role 'tu' di tuRoles (dari organization_tu)
 * atau role SUPERADMIN/ADMIN.
 */
@Injectable()
export class TuGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
