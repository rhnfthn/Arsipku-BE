import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard untuk endpoint Atasan Managerial TU.
 * Mengizinkan akses jika:
 * - persnum adalah 10010123 (HERMANA) atau 10010970 (PRIYO)
 * - role SUPERADMIN/ADMIN
 * - positionText mengandung EVP/VP/AVP
 * - bodTag terisi
 */
@Injectable()
export class AtasanTuGuard implements CanActivate {
  private readonly ALLOWED_PERSNUM = [10010123, 10010970];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User tidak terautentikasi');
    }

    // Cek persnum spesifik (HERMANA & PRIYO)
    if (user.persnum && this.ALLOWED_PERSNUM.includes(Number(user.persnum))) {
      return true;
    }

    // Superadmin/Admin selalu diizinkan
    const role = (user.role || '').toUpperCase();
    if (role === 'SUPERADMIN' || role === 'ADMIN') {
      return true;
    }

    // Cek apakah user adalah atasan managerial (EVP/VP/AVP)
    const posText = (user.positionText || '').toUpperCase();
    if (
      posText.includes('EVP') ||
      posText.includes('AVP') ||
      posText.includes('VP')
    ) {
      return true;
    }

    // Cek bodTag untuk atasan managerial
    if (user.bodTag && String(user.bodTag).trim() !== '') {
      return true;
    }

    throw new ForbiddenException('Akses hanya untuk Atasan Managerial TU');
  }
}
