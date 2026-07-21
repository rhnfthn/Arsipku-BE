import { PositionStatus } from '../enums/position-status.enum';

const DELEGATED_ACTORS = new Set<string>([PositionStatus.PT, PositionStatus.PH, PositionStatus.PS]);

export interface PengirimRenderFields {
  positionStatus: string; // 'PT' (etc) saat delegated, 'ybs' otherwise
  positionText: string; // 'PT. EVP of PMO' saat delegated, else basePositionText
  namaSirkuler: string; // user.nama (delegate) saat delegated, else fallbackName
}

/**
 * Render pengirim/penandatangan sesuai actor delegasi. Satu aturan untuk PDF + sirkulasi.
 * BE = sumber tunggal (pakai JWT user), tidak andalkan field FE.
 */
export function delegatedPengirimFields(
  user: { position_status?: string | null; nama?: string },
  basePositionText: string,
  fallbackName: string,
): PengirimRenderFields {
  const ps = user?.position_status;
  const isDelegated = !!ps && DELEGATED_ACTORS.has(ps);
  return {
    positionStatus: isDelegated ? (ps as string) : 'ybs',
    positionText: isDelegated ? `${ps}. ${basePositionText}` : basePositionText,
    namaSirkuler: isDelegated ? (user?.nama ?? '') : fallbackName,
  };
}
