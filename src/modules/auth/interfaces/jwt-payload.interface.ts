export interface JwtPayload {
  persnum: number;
  nama: string;
  role: 'user' | 'admin' | 'superadmin';
  
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
  
  // Personal data from HR API (fetched during login)
  nik?: string;  // NIK/KTP 16 digit untuk BSrE
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
