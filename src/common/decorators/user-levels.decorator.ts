import { SetMetadata } from '@nestjs/common';
import { UserLevel } from '../enums/user-level.enum';

export const USER_LEVELS_KEY = 'userLevels';

/**
 * Decorator untuk membatasi akses berdasarkan user level
 * 
 * @example
 * // Hanya direksi yang bisa akses
 * @UserLevels(UserLevel.DIREKSI)
 * 
 * @example
 * // Managerial dan Direksi bisa akses
 * @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
 * 
 * @example
 * // Semua level bisa akses
 * @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
 */
export const UserLevels = (...levels: UserLevel[]) => SetMetadata(USER_LEVELS_KEY, levels);
