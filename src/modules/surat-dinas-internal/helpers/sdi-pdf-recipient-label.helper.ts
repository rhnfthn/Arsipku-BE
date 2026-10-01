import { formatDeputyPositionLabel } from './deputy-position-label.helper';
import { formatDelegatedPositionText } from '../../../common/helpers/delegasi-rendering.helper';

type SdiPdfRecipientSource = {
  position_text?: string | null;
  positionText?: string | null;
  position_abbreviation?: string | null;
  abbreviation?: string | null;
  persnum_person_text?: string | null;
  namaSirkuler?: string | null;
  nama?: string | null;
  sub_area_text?: string | null;
  subAreaText?: string | null;
  area_text?: string | null;
  areaText?: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
};

/**
 * Format tertuju/tembusan SDI untuk PDF. GM menyertakan lokasi penugasannya
 * tanpa nama pejabat; penerima lain tetap menggunakan label jabatan.
 */
export function formatSdiPdfRecipientLabel(
  source: SdiPdfRecipientSource,
): string {
  const basePositionText = String(
    source.position_text ?? source.positionText ?? '',
  ).trim();
  const positionText = formatDelegatedPositionText(
    basePositionText,
    source.position_status ?? source.positionStatus,
  );
  const abbreviation = String(
    source.position_abbreviation ?? source.abbreviation ?? '',
  )
    .trim()
    .toUpperCase();
  const isGeneralManager =
    abbreviation === 'GM' ||
    /^(?:general\s+manager|GM)\b/i.test(basePositionText);

  if (!isGeneralManager) {
    return formatDeputyPositionLabel(source);
  }

  const location = String(
    source.sub_area_text ??
      source.subAreaText ??
      source.area_text ??
      source.areaText ??
      '',
  ).trim();

  return [positionText, location].filter(Boolean).join(' - ');
}
