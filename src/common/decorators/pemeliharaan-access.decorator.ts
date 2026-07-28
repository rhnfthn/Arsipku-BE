import { SetMetadata } from '@nestjs/common';
import type { PemeliharaanAccess as PemeliharaanAccessType } from '../helpers/pemeliharaan-access.helper';

export const PEMELIHARAAN_ACCESS_KEY = 'pemeliharaanAccess';
export const PemeliharaanAccess = (...accesses: PemeliharaanAccessType[]) =>
  SetMetadata(PEMELIHARAAN_ACCESS_KEY, accesses);
