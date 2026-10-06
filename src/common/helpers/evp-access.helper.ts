/**
 * Penandatangan BAC hanya tersedia untuk EVP dan jenjang di atasnya.
 *
 * BOD/BOD-1 adalah tag organisasi untuk Direksi. Position text tetap dicek
 * sebagai fallback karena sebagian snapshot organisasi tidak mengisi bodTag
 * secara konsisten dan karena konteks delegasi menambahkan prefix PT/PH/PS.
 */
export function isEvpOrAbovePosition(user: {
  bodTag?: unknown;
  positionText?: unknown;
}): boolean {
  const bodTag = String(user.bodTag ?? '')
    .trim()
    .toUpperCase();
  if (bodTag === 'BOD' || bodTag === 'BOD-1') return true;

  const positionText = String(user.positionText ?? '').toUpperCase();
  return /\b(EVP|DIREKTUR|DIRUT|DIRECTOR|CEO|PRESIDEN|PRESIDENT|BOD)\b/.test(
    positionText,
  );
}
