import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { normalizeRoleName } from '../enums/role-name.enum';

/**
 * Roles Guard (string-based, sederhana)
 * Pakai enum RoleName + normalisasi (backward compat dgn JWT lama lowercase).
 * Prioritas: user.activeRole.name (JWT baru) > user.role (backward compat).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('User not found');

    const userRole = normalizeRoleName(user?.activeRole?.name ?? user?.role);
    if (!userRole) throw new ForbiddenException('Missing user role');

    const normalizedRequired = requiredRoles
      .map((r) => normalizeRoleName(r))
      .filter(Boolean) as string[];

    if (!normalizedRequired.includes(userRole)) {
      throw new ForbiddenException(
        `User does not have required role. Required: ${normalizedRequired.join(', ')}, Current: ${userRole}`,
      );
    }
    return true;
  }
}