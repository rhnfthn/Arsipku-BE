/**
 * User Interface
 * Basic user structure for authentication
 */
export interface IUser {
  id: string;
  username?: string;
  email?: string;
  roles?: string[];
  position_id?: string;
  company?: string;
}

/**
 * JWT Payload Interface
 */
export interface IJwtPayload {
  sub: string;
  username?: string;
  email?: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}
