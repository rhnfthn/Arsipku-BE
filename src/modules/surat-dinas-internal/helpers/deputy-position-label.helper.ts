import { formatDelegatedPositionText } from '../../../common/helpers/delegasi-rendering.helper';

type DeputyPositionLabelSource = {
  position_text?: string | null;
  positionText?: string | null;
  area_text?: string | null;
  areaText?: string | null;
  sub_area_text?: string | null;
  subAreaText?: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
};

const DGM_PEO_PATTERN =
  /deputy\s+general\s+manager\s+perencanaan\s+dan\s+evaluasi\s+operasi/i;

/**
 * Menambahkan area hanya pada label Deputy GM PEO.
 * Aman dipanggil berulang kali karena suffix area tidak akan digandakan.
 */
export function formatDeputyPositionLabel(
  source: DeputyPositionLabelSource,
): string {
  const positionText = String(
    source.position_text ?? source.positionText ?? '',
  ).trim();
  if (!positionText) return positionText;

  const areaText = String(
    source.area_text ??
      source.areaText ??
      source.sub_area_text ??
      source.subAreaText ??
      '',
  ).trim();
  let withArea = positionText;
  if (DGM_PEO_PATTERN.test(positionText) && areaText) {
    const escapedArea = areaText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(?:^|\\s-\\s)${escapedArea}$`, 'i').test(positionText)) {
      withArea = `${positionText} - ${areaText}`;
    }
  }

  return formatDelegatedPositionText(
    withArea,
    source.position_status ?? source.positionStatus,
  );
}
