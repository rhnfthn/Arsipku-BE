export interface OidcTokenSet {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  tokenType?: string;
  expiresIn: number;
  refreshTokenExpiresAt?: string;
}

export interface OidcUserInfo {
  sub: string;
  name?: string;
  fullname?: string;
  username?: string;
  preferred_username?: string;
  email?: string | null;
  employee_no?: string | null;
  employeeNo?: string | null;
  is_admin?: boolean;
  application?: {
    code?: string;
    name?: string;
    client_id?: string;
    clientId?: string;
    image_app?: string | null;
  };
}

export interface OidcServerSession {
  state: string;
  codeVerifier: string;
  returnTo: string;
  frontendOrigin?: string;
  createdAt: number;
  appSessionId?: string;
  persnum?: number;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: string;
}
