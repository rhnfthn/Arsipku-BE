import { PositionStatus } from '../enums/position-status.enum';

/**
 * Akses fitur Naskah Lainnya berdasarkan position_status (aktor delegasi).
 * SE/VI/EXT ditolak; ybs/pt/ph/ps/null → lolos ke cek permission normal.
 * Mirror pola pemeliharaan-access.helper. Bukan berbasis role RBAC.
 */
const NASKAH_LAINNYA_BLOCKED = new Set<string>([
  PositionStatus.SE,
  PositionStatus.VI,
  PositionStatus.EXT,
]);

export function canAccessNaskahLainnya(
  positionStatus: string | null | undefined,
): boolean {
  return !(positionStatus && NASKAH_LAINNYA_BLOCKED.has(positionStatus));
}
