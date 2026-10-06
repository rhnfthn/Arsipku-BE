/**
 * Akses modul Pemindahan Arsip Aktif ke Inaktif.
 *
 * Modul ini adalah workspace Sekretaris Divisi. Status SE adalah sumber
 * otoritas utama; fallback tuRoles dipertahankan untuk token lama yang belum
 * membawa position_status tetapi sudah memiliki assignment sekretaris aktif.
 */
export function isDivisionSecretary(
  user:
    | {
        position_status?: string | null;
        positionStatus?: string | null;
        positionText?: string | null;
        tuRoles?: string[] | null;
        active_profile?: string | null;
      }
    | null
    | undefined,
): boolean {
  const positionStatus = String(
    user?.position_status ?? user?.positionStatus ?? '',
  )
    .trim()
    .toUpperCase();

  if (positionStatus === 'SE') return true;

  // Backward-compatible fallback: delegated profiles may expose the actor
  // in the rendered position text (for example, "SE. EVP of Technology")
  // while the legacy JWT still contains YBS/null in position_status.
  if (/^\s*SE(?:\.|\s|$)/i.test(String(user?.positionText ?? ''))) return true;

  return (
    Array.isArray(user?.tuRoles) &&
    user.tuRoles.includes('sekretaris') &&
    (user?.active_profile == null || user.active_profile === 'sekretaris')
  );
}
