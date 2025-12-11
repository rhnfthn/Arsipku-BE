import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Roles Guard
 * Checks if user has required roles to access the route
 * Usage: Apply after JwtAuthGuard
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    console.log('[RolesGuard] Checking roles:', {
      user: user ? { persnum: user.persnum, role: user.role } : null,
      requiredRoles,
      hasUser: !!user,
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Check if user has role property and matches required roles
    const hasRole = requiredRoles.some((role) => role === user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `User does not have required role. Required: ${requiredRoles.join(', ')}, Current: ${user.role}`,
      );
    }

    return true;
  }
}
