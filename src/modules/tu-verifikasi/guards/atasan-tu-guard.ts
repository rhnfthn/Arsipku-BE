import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard untuk endpoint Atasan Managerial TU.
 * Mengizinkan akses jika user punya role atasan managerial (EVP/VP/AVP)
 * atau SUPERADMIN/ADMIN.
 */
@Injectable()
export class AtasanTuGuard implements CanActivate {
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

    throw new ForbiddenException(
      'Akses hanya untuk Atasan Managerial TU',
    );
  }
}