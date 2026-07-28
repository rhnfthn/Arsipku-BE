import { PositionStatus } from '../enums/position-status.enum';
import { UserLevel, getUserLevel } from '../enums/user-level.enum';

export type PemeliharaanAccess = 'pemberkasan' | 'persetujuan';

const PEMBERKASAN_ACTORS = new Set<string>([PositionStatus.SE, PositionStatus.PS]);
const PERSETUJUAN_ACTORS = new Set<string>([PositionStatus.PT, PositionStatus.PH]);

/**
 * Effective role pemeliharaan dari position_status (aktor delegasi) + bodTag (level).
 * position_status diperiksa lebih dulu supaya bodTag delegator (ikut JWT saat
 * switch-role) diabaikan untuk aktor delegated. Bukan berbasis role RBAC.
 */
export function getEffectivePemeliharaanRole(
  positionStatus: string | null | undefined,
  bodTag: string | null | undefined,
): PemeliharaanAccess | null {
  if (positionStatus && PEMBERKASAN_ACTORS.has(positionStatus)) return 'pemberkasan';
  if (positionStatus && PERSETUJUAN_ACTORS.has(positionStatus)) return 'persetujuan';
  if (positionStatus === PositionStatus.VI || positionStatus === PositionStatus.EXT) return null;
  // YBS / null → level dari bodTag sendiri
  const level = getUserLevel(bodTag ?? '', false);
  if (level === UserLevel.MANAGERIAL || level === UserLevel.DIREKSI) return 'persetujuan';
  if (level === UserLevel.NON_MANAGERIAL) return 'pemberkasan';
  return null;
}
