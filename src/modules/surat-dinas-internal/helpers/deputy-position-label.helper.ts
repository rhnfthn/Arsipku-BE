type DeputyPositionLabelSource = {
  position_text?: string | null;
  positionText?: string | null;
  area_text?: string | null;
  areaText?: string | null;
  sub_area_text?: string | null;
  subAreaText?: string | null;
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
  if (!positionText || !DGM_PEO_PATTERN.test(positionText)) return positionText;

  const areaText = String(
    source.area_text ??
      source.areaText ??
      source.sub_area_text ??
      source.subAreaText ??
      '',
  ).trim();
  if (!areaText) return positionText;

  const escapedArea = areaText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|\\s-\\s)${escapedArea}$`, 'i').test(positionText))
    return positionText;

  return `${positionText} - ${areaText}`;
}
