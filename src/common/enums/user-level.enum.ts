/**
 * User Level berdasarkan BOD Tag dan Chief
 * - NON_MANAGERIAL: chief = 0 atau bodTag kosong
 * - MANAGERIAL: bodTag = 'BOD-2' atau 'BOD-3'
 * - DIREKSI: bodTag = 'BOD' atau 'BOD-1'
 */
export enum UserLevel {
  NON_MANAGERIAL = 'non_managerial',
  MANAGERIAL = 'managerial',
  DIREKSI = 'direksi',
}

/**
 * Mapping BOD tag ke user level
 */
export const BOD_TAG_MAPPING = {
  // Direksi
  BOD: UserLevel.DIREKSI,
  'BOD-1': UserLevel.DIREKSI,

  // Managerial
  'BOD-2': UserLevel.MANAGERIAL,
  'BOD-3': UserLevel.MANAGERIAL,
};

/**
 * Helper function to determine user level
 */
export function getUserLevel(bodTag: string, isChief: boolean): UserLevel {
  // Check BOD tag mapping
  if (bodTag && BOD_TAG_MAPPING[bodTag]) {
    return BOD_TAG_MAPPING[bodTag];
  }

  // Default to non-managerial
  return UserLevel.NON_MANAGERIAL;
}
