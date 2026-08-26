import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { TuVerifikasiService } from '../services/tu-verifikasi.service';

/**
 * Guard untuk endpoint Atasan Managerial TU.
 * Mengizinkan akses jika:
 * - persnum adalah 10010123 (HERMANA) atau 10010970 (PRIYO)
 * - role SUPERADMIN/ADMIN
 * - positionText mengandung EVP/VP/AVP
 * - bodTag terisi
 * - user terdaftar di tu_approval_levels usulan apapun (verifikator berjenjang)
 */
@Injectable()
export class AtasanTuGuard implements CanActivate {
  private readonly ALLOWED_PERSNUM = [10010123, 10010970];

  constructor(private readonly service: TuVerifikasiService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    // Cek apakah user terdaftar sebagai verifikator di tu_approval_levels
    // usulan apapun (mis. verifikator berjenjang level 2/3 yang bukan EVP/VP).
    try {
      const { isAtasanTu } = await this.service.isAtasanTu(user);
      if (isAtasanTu) {
        return true;
      }
    } catch {
      // ignore — lanjut ke penolakan default
    }

    throw new ForbiddenException('Akses hanya untuk Atasan Managerial TU');
  }
}
