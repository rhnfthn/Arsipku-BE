import { Injectable, UnauthorizedException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './session.service';
import { UserRoleEntity } from '../../superadmin/entities/user-role.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { RbacService } from '../../rbac/services/rbac.service';
import {
  JwtPayload,
  AirNavTokenResponse,
  AirNavRefreshResponse,
} from '../interfaces/jwt-payload.interface';
import { PositionStatus } from '../../../common/enums/position-status.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly orgDataService: OrgDataService,
    @InjectRepository(UserRoleEntity)
    private userRoleRepo: Repository<UserRoleEntity>,
    @Inject(forwardRef(() => RbacService))
    private readonly rbacService: RbacService,
  ) {}

  // ============================================
  // Helper Methods untuk fetch data dari HR API
  // ============================================

  /**
   * Build RBAC activeRole + activePermissions + roles[] (stateless, dari rbac_user_role).
   * Fallback: jika RbacService tidak tersedia (mis. tabel belum di-seed) → default USER tanpa permission.
   */
  private async buildRbacContext(persnum: number): Promise<{
    activeRole: JwtPayload['activeRole'];
    activePermissions: JwtPayload['activePermissions'];
    roles: JwtPayload['roles'];
    role: 'user' | 'admin' | 'superadmin';
  }> {
    try {
      const ctx = await this.rbacService.buildActiveRoleAndPermissions(persnum);
      return {
        activeRole: ctx.activeRole,
        activePermissions: ctx.activePermissions,
        roles: ctx.roles,
        role: ctx.role,
      };
    } catch (e) {
      console.warn('[AuthService] RBAC context failed, fallback to legacy user_role:', e?.message);
      const userRole = await this.userRoleRepo.findOne({ where: { persnum } });
      const role = (userRole?.role || 'user') as 'user' | 'admin' | 'superadmin';
      return { activeRole: null, activePermissions: [], roles: [], role };
    }
  }

  /**
   * Get NIK/KTP user dari HR API berdasarkan persnum
   * @param persnum - Persnum user
   * @param accessToken - AirNav access token untuk authorization
   * @returns NIK 16 digit atau null jika tidak ditemukan
   */
  private async fetchNikFromHrApi(persnum: number, accessToken: string): Promise<string | null> {
    try {
      console.log(`[AuthService] Fetching NIK for persnum: ${persnum}`);
      
      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.airnavindonesia.co.id/dataset-dev/hc/personal-ids/${persnum}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 30000,
          },
        ),
      );
      
      const data = response.data?.data ?? [];
      // subType '01' = KTP
      const filterktp = data.find((x: any) => x.subType === '01');
      
      if (filterktp) {
        console.log(`[AuthService] NIK found: ${filterktp.number.substring(0, 4)}****`);
        return filterktp.number;
      }
      
      console.log('[AuthService] NIK not found in HR API');
      return null;
    } catch (error: any) {
      console.error('[AuthService] Error fetching NIK:', error.message);
      return null;
    }
  }

  /**
   * Fetch NIK dari HR API (sama dengan logic di /digsig/ktp)
   * noWa tidak di-fetch karena data kosong/tidak tersedia
   * @param persnum - Persnum user
   * @param accessToken - AirNav access token
   * @returns Object containing nik (noWa selalu null)
   */
  private async fetchUserPersonalData(
    persnum: number,
    accessToken: string,
  ): Promise<{ nik: string | null; noWa: string | null }> {
    console.log(`[AuthService] Fetching personal data for persnum: ${persnum}`);
    
    // Fetch NIK dari HR API (sama dengan /digsig/ktp)
    const nik = await this.fetchNikFromHrApi(persnum, accessToken);
    
    // noWa tidak di-fetch karena data kosong/tidak tersedia
    // Field tetap ada untuk compatibility
    return { nik, noWa: null };
  }

  /**
   * Login with username & password (call AirNav login API directly)
   */
  async loginWithCredentials(
    username: string,
    password: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{
    message: string;
    accessToken: string;
    expiredToken: string;
    refreshToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const loginUrl = this.configService.get('AIRNAV_LOGIN_URL');
    console.log(loginUrl);

    // ================================================================
    // 1. Login ke AirNav API dengan username & password
    // ================================================================
    let airnavResponse: any;
    try {
      const req = this.httpService.post(
        loginUrl,
        {
          username,
          password,
          redirect_uri: "http://localhost:3000/autharsipku",
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      const res = await firstValueFrom(req);
      console.log(res.data);
      airnavResponse = res.data;
    } catch (err) {
      throw new UnauthorizedException({
        error: 'Failed to login to AirNav',
        details: {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
        },
      });
    }

    // Check response structure
    console.log(airnavResponse.responStatus);
    if (!airnavResponse || airnavResponse.responStatus !== 200) {
      throw new UnauthorizedException({
        error: 'Invalid credentialss',
        message: airnavResponse?.message || 'Login faileds',
      });
    }

    // Extract data dari response AirNav
    const { id, accessToken: access_token, refreshToken: refresh_token, expireToken: expired_token } = airnavResponse;
    console.log(access_token);
    const persnum = Number(id);

    // ================================================================
    // 2. Check user di org_data
    // ================================================================
    const orgData = await this.orgDataService.findByPersnum(persnum);
    console.log(orgData);

    if (!orgData) {
      throw new UnauthorizedException(
        'User tidak terdaftar di sistem organisasi',
      );
    }

    // ================================================================
    // 3. Get user role (optional - default 'user')
    // ================================================================
    const userRole = await this.userRoleRepo.findOne({
      where: { persnum },
    });

    console.log('[AuthService] Persnum:', persnum);
    console.log('[AuthService] UserRole from DB:', userRole);
    console.log('[AuthService] Role value:', userRole?.role);

    const legacyRole = userRole?.role || 'user';

    // ================================================================
    // 3b. Build RBAC context (activeRole, activePermissions, roles)
    // ================================================================
    const rbacCtx = await this.buildRbacContext(persnum);
    const role = rbacCtx.role || legacyRole;

    // ================================================================
    // 4. Fetch NIK dan noWa dari HR API (parallel)
    // ================================================================
    const personalData = await this.fetchUserPersonalData(persnum, access_token);
    console.log('[AuthService] Personal data fetched - NIK:', personalData.nik ? 'found' : 'not found', ', noWa:', personalData.noWa ? 'found' : 'not found');

    // ================================================================
    // 5. Build JWT payload
    // ================================================================
    const payload: JwtPayload = {
      persnum: orgData.persnum,
      nama: orgData.nama || '',
      role: role as 'user' | 'admin' | 'superadmin',
      activeRole: rbacCtx.activeRole ?? undefined,
      activePermissions: rbacCtx.activePermissions,
      roles: rbacCtx.roles,

      company: orgData.company?.toString() || '',
      companyText: orgData.companyText || '',
      area: orgData.area || '',
      areaText: orgData.areaText || '',
      subArea: orgData.subArea?.toString() || '',
      subAreaText: orgData.subAreaText || '',
      organization: orgData.organization?.toString() || '',
      organizationText: orgData.organizationText || '',
      position: orgData.position?.toString() || '',
      positionText: orgData.positionText || '',
      bodTag: orgData.bodTag || '',
      abbreviation: orgData.abbreviation || '',
      atasan_langsung: orgData.atasan_langsung || null,
      
      // Personal data dari HR API
      nik: personalData.nik || undefined,
      noWa: personalData.noWa || undefined,
    };

    // ================================================================
    // 6. Generate JWT (expires sync dengan AirNav token)
    // ================================================================
    const expiresIn = Math.floor(
      (new Date(expired_token).getTime() - Date.now()) / 1000,
    );

    const jwt = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn > 0 ? expiresIn : 86400, // fallback 24 jam
    });

    // ================================================================
    // 7. Save session
    // ================================================================
    const idPosition = orgData.position ? Number(orgData.position) : undefined;
    console.log('[AuthService] Creating session with id_position:', idPosition);
    
    const session = await this.sessionService.createSession(persnum, {
      airnavAccessToken: access_token,
      airnavRefreshToken: refresh_token,
      airnavExpiredAt: new Date(expired_token),
      idPosition,
      userAgent,
      ipAddress: ip,
    });

    return {
      message: 'Login success',
      accessToken: jwt,
      expiredToken: expired_token,
      refreshToken: refresh_token,
      sessionId: session.id,
      user: payload,
    };
  }

  /**
   * Login with AirNav SSO token
   */
  async loginWithSsoToken(
    ssoToken: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{
    message: string;
    accessToken: string;
    expiredToken: string;
    refreshToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const verifyUrl = this.configService.get('AIRNAV_VERIFY_URL');

    console.log('[AuthService] ===== SSO Login Started =====');
    console.log('[AuthService] Verify URL:', verifyUrl);

    // ================================================================
    // 1. Verify token ke AirNav API
    // ================================================================
    let ssoResponse: AirNavTokenResponse;
    try {
      console.log('[AuthService] Verifying token with AirNav...');
      const req = this.httpService.post(
        verifyUrl,
        {},
        {
          headers: {
            Authorization: `Bearer ${ssoToken}`,
            Accept: '*/*',
          },
        },
      );

      const res = await firstValueFrom(req);
      ssoResponse = res.data;
      console.log('[AuthService] AirNav response:', {
        validToken: ssoResponse.validToken,
        responStatus: ssoResponse.responStatus,
        id: ssoResponse.data?.id,
      });
    } catch (err) {
      console.error('[AuthService] Failed to verify token:', err.message);
      throw new UnauthorizedException({
        error: 'Failed to verify SSO token',
        details: {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
        },
      });
    }

    if (!ssoResponse.validToken || ssoResponse.responStatus !== 200) {
      console.error('[AuthService] Invalid token response:', ssoResponse);
      throw new UnauthorizedException('Invalid SSO token');
    }

    const persnum = Number(ssoResponse.data.id);
    console.log('[AuthService] User persnum from AirNav:', persnum);

    // ================================================================
    // 2. Check user di org_data
    // ================================================================
    console.log('[AuthService] Checking user in organization_build table...');
    const orgData = await this.orgDataService.findByPersnum(persnum);

    if (!orgData) {
      console.error('[AuthService] User not found in organization_build!');
      throw new UnauthorizedException(
        'User tidak terdaftar di sistem organisasi',
      );
    }

    console.log('[AuthService] User found:', orgData.nama);

    // ================================================================
    // 3. Get user role (optional - default 'user')
    // ================================================================
    console.log('[AuthService] Checking user role...');
    const userRole = await this.userRoleRepo.findOne({
      where: { persnum },
    });

    const legacyRole = userRole?.role || 'user';
    console.log('[AuthService] User role (legacy):', legacyRole);

    // ================================================================
    // 3b. Build RBAC context (activeRole, activePermissions, roles)
    // ================================================================
    const rbacCtx = await this.buildRbacContext(persnum);
    const role = rbacCtx.role || legacyRole;
    console.log('[AuthService] User role (final):', role);

    // ================================================================
    // 4. Fetch NIK dan noWa dari HR API (parallel)
    // ================================================================
    const personalData = await this.fetchUserPersonalData(persnum, ssoResponse.data.access_token);
    console.log('[AuthService] Personal data fetched - NIK:', personalData.nik ? 'found' : 'not found', ', noWa:', personalData.noWa ? 'found' : 'not found');

    // ================================================================
    // 5. Build JWT payload
    // ================================================================
    const payload: JwtPayload = {
      persnum: orgData.persnum,
      nama: orgData.nama || '',
      role: role as 'user' | 'admin' | 'superadmin',
      activeRole: rbacCtx.activeRole ?? undefined,
      activePermissions: rbacCtx.activePermissions,
      roles: rbacCtx.roles,

      company: orgData.company?.toString() || '',
      companyText: orgData.companyText || '',
      area: orgData.area || '',
      areaText: orgData.areaText || '',
      subArea: orgData.subArea?.toString() || '',
      subAreaText: orgData.subAreaText || '',
      organization: orgData.organization?.toString() || '',
      organizationText: orgData.organizationText || '',
      position: orgData.position?.toString() || '',
      positionText: orgData.positionText || '',
      bodTag: orgData.bodTag || '',
      abbreviation: orgData.abbreviation || '',
      atasan_langsung: orgData.atasan_langsung || null,
      
      // Personal data dari HR API
      nik: personalData.nik || undefined,
      noWa: personalData.noWa || undefined,
    };

    // ================================================================
    // 6. Generate JWT (expires sync dengan AirNav token)
    // ================================================================
    console.log('[AuthService] Generating JWT token...');
    const expiresIn = Math.floor(
      (new Date(ssoResponse.data.expired_token).getTime() - Date.now()) / 1000,
    );

    const jwt = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn > 0 ? expiresIn : 86400, // fallback 24 jam
    });

    console.log('[AuthService] JWT generated, expires in:', expiresIn, 'seconds');

    // ================================================================
    // 7. Save session
    // ================================================================
    console.log('[AuthService] Creating session...');
    const idPosition = orgData.position ? Number(orgData.position) : undefined;
    console.log('[AuthService] id_position value:', idPosition);
    
    const session = await this.sessionService.createSession(persnum, {
      airnavAccessToken: ssoResponse.data.access_token,
      airnavRefreshToken: ssoResponse.data.refresh_token,
      airnavExpiredAt: new Date(ssoResponse.data.expired_token),
      idPosition,
      userAgent,
      ipAddress: ip,
    });

    console.log('[AuthService] Session created:', session.id);
    console.log('[AuthService] ===== SSO Login Success =====');

    return {
      message: 'Login success',
      accessToken: jwt,
      expiredToken: ssoResponse.data.expired_token,
      refreshToken: ssoResponse.data.refresh_token,
      sessionId: session.id,
      user: payload,
    };
  }

  /**
   * Refresh token via session
   */
  async refreshWithSession(
    sessionId: string,
    appToken: string,
  ): Promise<{
    message: string;
    accessToken: string;
    expiredToken: string;
    refreshToken: string;
    sessionId: string;
    payloadRefresh: JwtPayload;
  }> {
    console.log('[AuthService] ===== Refresh Token Started =====');
    console.log('[AuthService] Session ID:', sessionId);
    
    // Cleanup expired sessions
    await this.sessionService.deleteExpiredSessions();

    // ================================================================
    // 1. Find session
    // ================================================================
    const session = await this.sessionService.findSession(sessionId);
    if (!session) {
      console.error('[AuthService] Session not found:', sessionId);
      throw new UnauthorizedException('Session not found');
    }

    console.log('[AuthService] Session found for user:', session.userPersnum);
    console.log('[AuthService] Session expires at:', session.airnavExpiredAt);

    if (session.airnavExpiredAt < new Date()) {
      console.error('[AuthService] SSO session expired');
      throw new UnauthorizedException('SSO session expired');
    }

    // ================================================================
    // 2. Refresh AirNav token
    // ================================================================
    const refreshUrl = this.configService.get('AIRNAV_REFRESH_URL');
    console.log('[AuthService] Refreshing AirNav token...');
    console.log('[AuthService] Refresh URL:', refreshUrl);
    console.log('[AuthService] Refresh token:', session.airnavRefreshToken);
    console.log('[AuthService] Access token (first 50 chars):', session.airnavAccessToken?.substring(0, 50));

    let ssoRefresh: AirNavRefreshResponse;
    try {
      const req = this.httpService.post(
        refreshUrl,
        { token: session.airnavRefreshToken },
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${session.airnavAccessToken}`,
          },
        },
      );

      const res = await firstValueFrom(req);
      ssoRefresh = res.data;
      
      console.log('[AuthService] AirNav refresh success');
    } catch (err) {
      console.error('[AuthService] Failed to refresh AirNav token:', err.message);
      throw new UnauthorizedException('Failed to refresh SSO token');
    }

    // ================================================================
    // 3. Update session
    // ================================================================
    console.log('[AuthService] Updating session in database...');
    console.log('[AuthService] New expire time:', ssoRefresh.expireToken);
    
    await this.sessionService.updateSession(sessionId, {
      airnavAccessToken: ssoRefresh.accessToken,
      airnavRefreshToken: ssoRefresh.refreshToken,
      airnavExpiredAt: new Date(ssoRefresh.expireToken),
    });

    console.log('[AuthService] Session updated successfully');

    // ================================================================
    // 4. Decode old JWT & get fresh user data
    // ================================================================
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(appToken, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException('Invalid application token');
    }

    const orgData = await this.orgDataService.findByPersnum(payload.persnum);
    if (!orgData) {
      throw new UnauthorizedException('User not found');
    }

    const userRole = await this.userRoleRepo.findOne({
      where: { persnum: payload.persnum },
    });

    const legacyRole = userRole?.role || 'user';

    // Build fresh RBAC context
    const rbacCtx = await this.buildRbacContext(payload.persnum);
    const role = rbacCtx.role || legacyRole;

    // Fetch fresh NIK dan noWa dari HR API
    const personalData = await this.fetchUserPersonalData(payload.persnum, ssoRefresh.accessToken);

    // Preserve delegation context across refresh (spec D5). When the decoded token
    // has an active delegated actor, carry position_status + delegator_persnum +
    // the delegated org-scope fields forward; refresh RBAC fresh by the delegate's
    // own persnum so the SUPERADMIN bypass stays tied to the delegate (spec D4).
    const { exp: _oldExp, iat: _oldIat, ...delegatedCtx } = payload as any;
    const delegatedStatuses: string[] = [
      PositionStatus.PT, PositionStatus.PH, PositionStatus.PS,
      PositionStatus.VI, PositionStatus.SE,
    ];
    const isDelegated =
      !!payload.position_status &&
      delegatedStatuses.includes(payload.position_status as string);

    const newPayload: JwtPayload = isDelegated
      ? {
          ...delegatedCtx, // position_status, delegator_persnum, delegated org scope, persnum, nama, bodTag, abbreviation, atasan_langsung
          role: role as 'user' | 'admin' | 'superadmin',
          activeRole: rbacCtx.activeRole ?? undefined,
          activePermissions: rbacCtx.activePermissions,
          roles: rbacCtx.roles,
          nik: personalData.nik || undefined,
          noWa: personalData.noWa || undefined,
        }
      : {
          persnum: orgData.persnum,
          nama: orgData.nama || '',
          role: role as 'user' | 'admin' | 'superadmin',
          activeRole: rbacCtx.activeRole ?? undefined,
          activePermissions: rbacCtx.activePermissions,
          roles: rbacCtx.roles,
          company: orgData.company?.toString() || '',
          companyText: orgData.companyText || '',
          area: orgData.area || '',
          areaText: orgData.areaText || '',
          subArea: orgData.subArea?.toString() || '',
          subAreaText: orgData.subAreaText || '',
          organization: orgData.organization?.toString() || '',
          organizationText: orgData.organizationText || '',
          position: orgData.position?.toString() || '',
          positionText: orgData.positionText || '',
          bodTag: orgData.bodTag || '',
          abbreviation: orgData.abbreviation || '',
          atasan_langsung: orgData.atasan_langsung || null,
          nik: personalData.nik || undefined,
          noWa: personalData.noWa || undefined,
        };

    // ================================================================
    // 5. Generate new JWT
    // ================================================================
    console.log('[AuthService] Generating new JWT...');
    const expiresIn = Math.floor(
      (new Date(ssoRefresh.expireToken).getTime() - Date.now()) / 1000,
    );

    const newJwt = await this.jwtService.signAsync(newPayload, {
      expiresIn: expiresIn > 0 ? expiresIn : 86400,
    });

    console.log('[AuthService] JWT expires in:', expiresIn, 'seconds');
    console.log('[AuthService] ===== Refresh Token Success =====');

    return {
      message: 'Refresh token success',
      accessToken: newJwt,
      expiredToken: ssoRefresh.expireToken,
      refreshToken: ssoRefresh.refreshToken,
      sessionId,
      payloadRefresh: newPayload,
    };
  }

  /**
   * Switch role - Generate new JWT with delegated position data or reset to original
   * @param currentUser - Current JWT payload (from @CurrentUser decorator)
   * @param delegasi - Delegation info if switching to delegated role, or null to reset to original
   * @returns New JWT token with updated position data
   */
  async switchRole(
    currentUser: JwtPayload,
    delegasi: {
      as_position: string;
      as_position_text: string;
      as_organization: string;
      as_organization_text: string;
      as_area: string;
      as_area_text: string;
      as_sub_area: string;
      as_sub_area_text: string;
      company: string;
      company_text: string;
      position_status: string;
      persnum?: string; // delegator's persnum (DelegasiEntity.persnum is varchar)
    } | null,
  ): Promise<{
    message: string;
    accessToken: string;
    user: JwtPayload;
  }> {
    // Remove exp and iat from current user payload to avoid conflict with new token
    const { exp, iat, ...basePayload } = currentUser;
    
    let newPayload: Omit<JwtPayload, 'exp' | 'iat'>;

    if (delegasi) {
      // Switch to delegated role
      newPayload = {
        ...basePayload,
        // Update position data dengan data delegasi
        position: delegasi.as_position,
        positionText: delegasi.as_position_text,
        organization: delegasi.as_organization,
        organizationText: delegasi.as_organization_text,
        area: delegasi.as_area,
        areaText: delegasi.as_area_text,
        subArea: delegasi.as_sub_area,
        subAreaText: delegasi.as_sub_area_text,
        company: delegasi.company,
        companyText: delegasi.company_text,
        // Delegasi context for PermissionGuard.
        position_status: (delegasi.position_status as PositionStatus) ?? null,
        delegator_persnum: delegasi.persnum ? Number(delegasi.persnum) : null,
        // Keep original persnum and nama
        // Role tetap sama
      };
    } else {
      // Reset to original role - fetch from org_data
      const orgData = await this.orgDataService.findByPersnum(basePayload.persnum);
      
      if (!orgData) {
        throw new UnauthorizedException('User data not found in org_data');
      }

      newPayload = {
        ...basePayload,
        // Reset ke data asli dari org_data
        company: orgData.company?.toString() || '',
        companyText: orgData.companyText || '',
        area: orgData.area || '',
        areaText: orgData.areaText || '',
        subArea: orgData.subArea?.toString() || '',
        subAreaText: orgData.subAreaText || '',
        organization: orgData.organization?.toString() || '',
        organizationText: orgData.organizationText || '',
        position: orgData.position?.toString() || '',
        positionText: orgData.positionText || '',
        bodTag: orgData.bodTag || '',
        abbreviation: orgData.abbreviation || '',
        atasan_langsung: orgData.atasan_langsung || null,
        // Clear delegation context on reset.
        position_status: null,
        delegator_persnum: null,
      };
    }

    // Generate new JWT with same expiry as current token
    const expiresIn = exp 
      ? Math.max(Math.floor((exp * 1000 - Date.now()) / 1000), 3600) // min 1 hour
      : 86400; // default 24 hours

    const newJwt = await this.jwtService.signAsync(newPayload, {
      expiresIn,
    });

    return {
      message: delegasi 
        ? `Berhasil switch ke role ${delegasi.as_position_text}` 
        : 'Berhasil kembali ke role asli',
      accessToken: newJwt,
      user: newPayload as JwtPayload,
    };
  }

  /**
   * Switch company - Generate new JWT with different company/position data
   * @param currentUser - Current JWT payload (from @CurrentUser decorator)
   * @param companySwitchData - Company switch data from CompanySwitchService
   * @returns New JWT token with updated company/position data
   */
  async switchCompany(
    currentUser: JwtPayload,
    companySwitchData: {
      company: string;
      companyText: string;
      position: string;
      positionText: string;
      organization: string;
      organizationText: string;
      area: string;
      areaText: string;
      subArea: string;
      subAreaText: string;
      bodTag?: string;
      abbreviation?: string;
    } | null,
  ): Promise<{
    message: string;
    accessToken: string;
    user: JwtPayload;
  }> {
    if (!companySwitchData) {
      throw new BadRequestException('Company switch data is required');
    }

    // Remove exp and iat from current user payload to avoid conflict with new token
    const { exp, iat, ...basePayload } = currentUser;
    
    // Build new payload with switched company data
    const newPayload: Omit<JwtPayload, 'exp' | 'iat'> = {
      ...basePayload,
      // Update company and position data
      company: companySwitchData.company,
      companyText: companySwitchData.companyText,
      position: companySwitchData.position,
      positionText: companySwitchData.positionText,
      organization: companySwitchData.organization,
      organizationText: companySwitchData.organizationText,
      area: companySwitchData.area,
      areaText: companySwitchData.areaText,
      subArea: companySwitchData.subArea,
      subAreaText: companySwitchData.subAreaText,
      bodTag: companySwitchData.bodTag || '',
      abbreviation: companySwitchData.abbreviation || '',
      // Keep original persnum, nama, and role
    };

    console.log('[AuthService] Switching company to:', companySwitchData.companyText);
    console.log('[AuthService] New position:', companySwitchData.positionText);

    // Generate new JWT with same expiry as current token
    const expiresIn = exp 
      ? Math.max(Math.floor((exp * 1000 - Date.now()) / 1000), 3600) // min 1 hour
      : 86400; // default 24 hours

    const newJwt = await this.jwtService.signAsync(newPayload, {
      expiresIn,
    });

    return {
      message: `Berhasil switch ke ${companySwitchData.companyText}`,
      accessToken: newJwt,
      user: newPayload as JwtPayload,
    };
  }
}
