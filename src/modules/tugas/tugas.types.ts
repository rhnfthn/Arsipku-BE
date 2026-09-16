import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

export type TugasActor = Pick<
  JwtPayload,
  'persnum' | 'nama' | 'company' | 'position' | 'positionText' | 'role'
>;

export interface TugasPage<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
