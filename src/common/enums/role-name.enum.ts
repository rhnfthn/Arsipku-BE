export enum RoleName {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * Normalisasi nama role untuk backward-compat dengan JWT lama yang memakai lowercase
 * - 'superadmin' (lowercase, JWT lama) -> 'SUPERADMIN'
 * - 'SUPER_ADMIN' (helpdesk style) -> 'SUPERADMIN'
 * - 'admin' -> 'ADMIN'
 * - 'user' -> 'USER'
 */
export function normalizeRoleName(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const upper = raw.toString().trim().toUpperCase();
  if (upper === 'SUPERADMIN' || upper === 'SUPER_ADMIN') return RoleName.SUPERADMIN;
  if (upper === 'ADMIN') return RoleName.ADMIN;
  if (upper === 'USER') return RoleName.USER;
  return upper;
}