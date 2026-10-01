import { PositionStatus } from '../enums/position-status.enum';

const DELEGATED_ACTORS = new Set<string>([
  PositionStatus.PT,
  PositionStatus.PH,
  PositionStatus.PS,
]);

export function formatDelegatedPositionText(
  basePositionText: unknown,
  positionStatus: unknown,
): string {
  const status = String(positionStatus ?? '')
    .trim()
    .toUpperCase();
  const positionText = String(basePositionText ?? '').trim();
  if (!DELEGATED_ACTORS.has(status) || !positionText) return positionText;
  return new RegExp(`^${status}\\.\\s*`, 'i').test(positionText)
    ? positionText
    : `${status}. ${positionText}`;
}

export function delegatedRecipientFields(source: {
  position_text?: unknown;
  positionText?: unknown;
  position_status?: unknown;
  positionStatus?: unknown;
}) {
  const status = String(source.position_status ?? source.positionStatus ?? '')
    .trim()
    .toUpperCase();
  const isDelegated = DELEGATED_ACTORS.has(status);
  return {
    positionText: formatDelegatedPositionText(
      source.position_text ?? source.positionText,
      status,
    ),
    positionStatus: isDelegated ? status.toLowerCase() : 'ybs',
  };
}

export interface PengirimRenderFields {
  positionStatus: string; // 'PT' (etc) saat delegated, 'ybs' otherwise
  positionText: string; // 'PT. EVP of PMO' saat delegated, else basePositionText
  namaSirkuler: string; // nama orang yang mengisi delegasi
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
  const ps = String(user?.position_status ?? '')
    .trim()
    .toUpperCase();
  const isDelegated = DELEGATED_ACTORS.has(ps);
  const delegatedPositionText = formatDelegatedPositionText(
    basePositionText,
    ps,
  );
  return {
    positionStatus: isDelegated ? ps : 'ybs',
    positionText: delegatedPositionText,
    namaSirkuler: isDelegated
      ? String(user?.nama ?? fallbackName).trim()
      : fallbackName,
  };
}

// All delegated actors (incl. VI/SE) — for enforcement + auth (effectivePersnum).
// VI/SE resolve by delegator_persnum even though they can't send (the rendering
// helper above uses the smaller DELEGATED_ACTORS set, excluding VI/SE).
const EFFECTIVE_PERSNUM_ACTORS = new Set<string>([
  PositionStatus.PT,
  PositionStatus.PH,
  PositionStatus.PS,
  PositionStatus.VI,
  PositionStatus.SE,
]);

export function isDelegatedActor(user: {
  position_status?: string | null;
}): boolean {
  const ps = user?.position_status;
  return !!ps && EFFECTIVE_PERSNUM_ACTORS.has(ps);
}

export function computeEffectivePersnum(user: {
  position_status?: string | null;
  persnum: number;
  delegator_persnum?: number | null;
}): number {
  return isDelegatedActor(user) && user.delegator_persnum
    ? user.delegator_persnum
    : user.persnum;
}
