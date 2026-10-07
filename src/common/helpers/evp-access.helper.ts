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
  abbreviation?: unknown;
  position_status?: unknown;
  positionStatus?: unknown;
  active_profile?: unknown;
  activeProfile?: unknown;
}): boolean {
  // Jabatan pada token dapat berasal dari konteks delegasi (misalnya
  // `SE. EVP ...`). Konteks tersebut tidak boleh menaikkan hak akses staff
  // menjadi EVP. BAC hanya boleh diakses dari akun asli, bukan profile
  // Sekretaris atau aktor delegasi.
  const positionStatus = String(
    user.position_status ?? user.positionStatus ?? '',
  )
    .trim()
    .toUpperCase();
  const activeProfile = String(
    user.active_profile ?? user.activeProfile ?? '',
  )
    .trim()
    .toLowerCase();
  if (activeProfile === 'sekretaris' || (positionStatus && positionStatus !== 'YBS')) {
    return false;
  }

  const bodTag = String(user.bodTag ?? '')
    .trim()
    .toUpperCase();
  if (bodTag === 'BOD' || bodTag === 'BOD-1') return true;

  const positionText = String(user.positionText ?? '')
    .trim()
    .toUpperCase();
  const abbreviation = String(user.abbreviation ?? '')
    .trim()
    .toUpperCase();

  // Beberapa profil hanya mengisi singkatan jabatan pada abbreviation.
  if (abbreviation === 'EVP' || abbreviation === 'BOD' || abbreviation === 'DIRUT') {
    return true;
  }

  return /\b(EVP|EXECUTIVE VICE PRESIDENT|DIREKTUR|DIRUT|DIRECTOR|CEO|PRESIDEN|PRESIDENT|BOD)\b/.test(
    positionText,
  );
}
