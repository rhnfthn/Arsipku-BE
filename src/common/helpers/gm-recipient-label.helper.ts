import { formatDelegatedPositionText } from './delegasi-rendering.helper';

export function formatGmRecipientLabel(source: {
  position_text?: string | null;
  positionText?: string | null;
  position_abbreviation?: string | null;
  abbreviation?: string | null;
  persnum_person_text?: string | null;
  namaSirkuler?: string | null;
  nama_sirkuler?: string | null;
  nama?: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
}): string | undefined {
  const position = String(
    source.position_text ?? source.positionText ?? '',
  ).trim();
  const abbreviation = String(
    source.position_abbreviation ?? source.abbreviation ?? '',
  ).trim();
  if (
    !/^GM(?:[-_\s]|$)/i.test(abbreviation) &&
    !/^(?:general\s+manager|GM)\b/i.test(
      position.replace(/^(?:PT|PH|PS)\.\s*/i, ''),
    )
  )
    return undefined;
  const name = String(
    source.namaSirkuler ??
      source.nama_sirkuler ??
      source.persnum_person_text ??
      source.nama ??
      '',
  ).trim();
  return [
    name
      .toLocaleLowerCase('id-ID')
      .replace(/(^|[\s/.-])\p{L}/gu, (letter) =>
        letter.toLocaleUpperCase('id-ID'),
      ),
    abbreviation || 'GM',
    formatDelegatedPositionText(
      position,
      source.position_status ?? source.positionStatus,
    ),
  ]
    .filter(Boolean)
    .join(' - ');
}
