import { formatDelegatedPositionText } from './delegasi-rendering.helper';

export function formatGmRecipientLabel(
  source: {
    position_text?: string | null;
    positionText?: string | null;
    position_abbreviation?: string | null;
    abbreviation?: string | null;
    persnum_person_text?: string | null;
    namaSirkuler?: string | null;
    nama_sirkuler?: string | null;
    nama?: string | null;
    area_text?: string | null;
    areaText?: string | null;
    sub_area_text?: string | null;
    subAreaText?: string | null;
    position_status?: string | null;
    positionStatus?: string | null;
  },
  includeAbbreviation = true,
): string | undefined {
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
  const branch =
    [
      source.area_text,
      source.areaText,
      source.sub_area_text,
      source.subAreaText,
    ]
      .map((value) => String(value ?? '').trim())
      .find(Boolean) || '';
  const positionWithBranch =
    branch &&
    !position
      .toLocaleLowerCase('id-ID')
      .endsWith(branch.toLocaleLowerCase('id-ID'))
      ? `${position} - ${branch}`
      : position;
  return [
    name
      .toLocaleLowerCase('id-ID')
      .replace(/(^|[\s/.-])\p{L}/gu, (letter) =>
        letter.toLocaleUpperCase('id-ID'),
      ),
    includeAbbreviation ? abbreviation || 'GM' : '',
    formatDelegatedPositionText(
      positionWithBranch,
      source.position_status ?? source.positionStatus,
    ),
  ]
    .filter(Boolean)
    .join(' - ');
}
