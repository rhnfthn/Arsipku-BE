/** Batasi picker korespondensi sampai jajaran Direksi/Dirut (tanpa Dewan Pengawas). */
export const isAllowedCorrespondenceRecipient = (
  position: unknown,
): boolean => {
  if (!position || typeof position !== 'object') return true;
  const item = position as Record<string, unknown>;
  const identity = [
    item.position_text,
    item.positionText,
    item.organization_text,
    item.organizationText,
    item.jabatan,
  ]
    .filter(Boolean)
    .map(String)
    .join(' ')
    .toLocaleLowerCase('id-ID');

  return !identity.includes('dewan pengawas');
};
