import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { canAccessNaskahLainnya } from '../helpers/naskah-lainnya-access.helper';
import { normalizeRoleName, RoleName } from '../enums/role-name.enum';
import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Controller-level guard: block SE/VI/EXT dari semua endpoint Naskah Lainnya.
 * Aturan seragam (tanpa decorator per-method) karena berlaku untuk seluruh
 * controller. ADMIN/SUPERADMIN bypass (konsisten dgn PemeliharaanAccessGuard).
 * position_status dibaca dari JWT payload, bukan DB.
 */
@Injectable()
export class NaskahLainnyaAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user: JwtPayload | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('User not authenticated');

    const role = normalizeRoleName(user?.activeRole?.name ?? user?.role);
    if (role === RoleName.ADMIN || role === RoleName.SUPERADMIN) return true;

    if (!canAccessNaskahLainnya(user.position_status)) {
      throw new ForbiddenException(
        'Akses Naskah Lainnya tidak tersedia untuk status posisi Anda.',
      );
    }
    return true;
  }
}
