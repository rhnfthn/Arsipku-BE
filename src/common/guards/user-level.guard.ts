import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { USER_LEVELS_KEY } from '../decorators/user-levels.decorator';
import { UserLevel, getUserLevel } from '../enums/user-level.enum';
import { normalizeRoleName, RoleName } from '../enums/role-name.enum';
import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

@Injectable()
export class UserLevelGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required user levels from decorator
    const requiredLevels = this.reflector.getAllAndOverride<UserLevel[]>(
      USER_LEVELS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no levels specified, allow access
    if (!requiredLevels || requiredLevels.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admin and superadmin bypass user level check
    const activeRoleName = normalizeRoleName(
      user?.activeRole?.name ?? user?.role,
    );
    if (
      activeRoleName === RoleName.ADMIN ||
      activeRoleName === RoleName.SUPERADMIN
    ) {
      return true;
    }

    // Determine user level from bodTag
    const userLevel = getUserLevel(user.bodTag, false); // chief tidak ada di JWT, default false

    // Check if user level is allowed
    if (requiredLevels.includes(userLevel)) {
      return true;
    }

    // Build error message
    const levelNames = requiredLevels.join(', ');
    throw new ForbiddenException(
      `Access denied. Required level: ${levelNames}. Your level: ${userLevel}`,
    );
  }
}
