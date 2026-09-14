import { PositionStatus } from '../../../common/enums/position-status.enum';

export interface ActivePermission {
  resource: string;
  actions: string[];
}

export interface ActiveRoleInfo {
  id: string;
  name: string;
}

export interface JwtPayload {
  persnum: number;
  nama: string;
  role: 'user' | 'admin' | 'superadmin';
  // RBAC v2 — stateless di JWT (switch role = re-sign JWT)
  activeRole?: ActiveRoleInfo | null;
  activePermissions?: ActivePermission[];
  roles?: ActiveRoleInfo[];
  // Role tambahan dari tabel organization_tu (Unit TU): 'tu' | 'sekretaris'
  tuRoles?: string[];
  // Delegation actor fields (populated during switchRole / PT/PH/PS/VI/SE)
  position_status?: PositionStatus | null;
  delegator_persnum?: number | null;

  // Profile switching (sekretaris delegasi)
  // has_secretary_delegation: true jika user punya assignment sekretaris_delegasi aktif
  // available_profiles: daftar profile yang bisa dipilih user
  // active_profile: profile yang sedang aktif ('akun_asli' default | 'sekretaris')
  has_secretary_delegation?: boolean;
  available_profiles?: string[];
  active_profile?: 'akun_asli' | 'sekretaris';

  // Organization data from org_data
  company: string;
  companyText: string;
  area: string;
  areaText: string;
  subArea: string;
  subAreaText: string;
  organization: string;
  organizationText: string;
  position: string;
  positionText: string;
  bodTag: string;
  abbreviation: string;
  atasan_langsung?: {
    persnum: number | null;
    nama: string | null;
    company: number | null;
    companyText: string | null;
    area: string | null;
    areaText: string | null;
    subArea: number | null;
    subAreaText: string | null;
    organization: number | null;
    organizationText: string | null;
    organizationAbbreviation: string | null;
    position: number | null;
    positionText: string | null;
    positionAbbreviation: string | null;
    abbreviation: string;
    isChief: boolean;
    bodTag: string | null;
  } | null;

  // Personal data from HR API (fetched during login)
  nik?: string; // NIK/KTP 16 digit untuk BSrE
  noWa?: string; // Nomor WhatsApp dengan prefix +62

  // Standard JWT fields
  iat?: number;
  exp?: number;
}

export interface AirNavTokenResponse {
  validToken: boolean;
  responStatus: number;
  message: string;
  data: {
    id: number; // persnum
    persnum: number;
    name: string;
    access_token: string;
    refresh_token: string;
    expired_token: string;
    position?: string;
    organization?: string;
    area?: string;
    company?: string;
  };
}

export interface AirNavRefreshResponse {
  responStatus: number; // Note: typo in AirNav API response
  accessToken: string;
  refreshToken: string;
  expireToken: string;
}

export interface AirNavOidcTokenData {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn: number;
  refreshTokenExpiresAt?: string;
  idToken?: string;
  scope?: string;
}

export interface AirNavOidcTokenWireData {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token_expires_at?: string;
  id_token?: string;
  scope?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  refreshTokenExpiresAt?: string;
  idToken?: string;
}

export interface AirNavOidcTokenResponse extends AirNavOidcTokenWireData {
  success?: boolean;
  data?: AirNavOidcTokenWireData;
}

export interface AirNavOidcUserInfo {
  sub: string;
  name?: string;
  fullname?: string;
  username?: string;
  preferred_username?: string;
  email: string | null;
  employee_no: string | null;
  is_admin?: boolean;
  groups?: string[];
  application?: {
    code: string;
    name: string;
    client_id: string;
    image_app: string | null;
  };
}
