import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
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
import { isDelegatedActor } from '../../../common/helpers/delegasi-rendering.helper';
import { OrganizationTuService } from '../../organization-tu/organization-tu.service';
import { DEFAULT_BSRE_NIK } from '../../../common/constants/bsre.constants';
import { AirnavAuthV2Client } from '../clients/airnav-auth-v2.client';
import type {
  OidcServerSession,
  OidcUserInfo,
} from '../interfaces/oidc.interface';
import { OidcSessionService } from './oidc-session.service';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOidcSessionId,
  generateOidcState,
  safeStateEquals,
} from '../utils/pkce.util';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditModule } from '../../audit/enums/audit-module.enum';
import { AuditStatus } from '../../audit/enums/audit-status.enum';

@Injectable()
export class AuthService {
  private readonly oidcRefreshRequests = new Map<string, Promise<any>>();

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
    private readonly organizationTuService: OrganizationTuService,
    private readonly airnavAuthV2Client: AirnavAuthV2Client,
    private readonly oidcSessionService: OidcSessionService,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /** Catat login yang selesai melalui callback GET (tidak ditangkap auto-audit). */
  private recordLoginAudit(
    payload: JwtPayload,
    sessionId: string,
    userAgent: string | undefined,
    ip: string | undefined,
    requestMethod: string,
    requestUrl: string,
  ): void {
    const userName = payload.nama || String(payload.persnum);
    this.auditTrailService.createAsync({
      action: AuditAction.LOGIN,
      module: AuditModule.AUTH,
      persnum: payload.persnum,
      userName: payload.nama || null,
      userRole: payload.activeRole?.name ?? payload.role ?? null,
      idPosition: payload.position || null,
      unitKerja: payload.organization || null,
      description: `Login oleh ${userName} pada modul AUTH`,
      newValue: {
        timestamp: new Date().toISOString(),
        ipAddress: ip ?? null,
        device: userAgent ?? null,
      },
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      requestMethod,
      requestUrl,
      status: AuditStatus.SUCCESS,
      metadata: {
        action: AuditAction.LOGIN,
        module: AuditModule.AUTH,
        method: requestMethod,
        path: requestUrl,
        sessionId,
        source: 'auth-session-created',
      },
    });
  }

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
      console.warn(
        '[AuthService] RBAC context failed, fallback to legacy user_role:',
        e?.message,
      );
      const userRole = await this.userRoleRepo.findOne({ where: { persnum } });
      const role = (userRole?.role || 'user') as
        | 'user'
        | 'admin'
        | 'superadmin';
      return { activeRole: null, activePermissions: [], roles: [], role };
    }
  }

  /**
   * Build tambahan role dari tabel organization_tu (Unit TU).
   * Mengembalkan array string: 'tu' (unit_dokumen) dan/atau 'sekretaris' (sekretaris_delegasi).
   * Hanya assignment aktif & valid berdasarkan tanggal yang dihitung.
   */
  private async buildTuRoles(persnum: number): Promise<string[]> {
    try {
      return await this.organizationTuService.getActiveRolesForPersnum(persnum);
    } catch (e) {
      console.warn(
        '[AuthService] Failed to build TU roles, fallback to empty:',
        e?.message,
      );
      return [];
    }
  }

  /**
   * Public helper untuk mengambil role tambahan dari organization_tu.
   * Dipakai endpoint switch-profile untuk memvalidasi delegasi sekretaris.
   */
  async getTuRolesForPersnum(persnum: number): Promise<string[]> {
    return this.buildTuRoles(persnum);
  }

  /**
   * Build context profile switching untuk delegasi sekretaris.
   * Jika user punya assignment aktif `sekretaris_delegasi` di organization_tu,
   * maka user bisa beralih antara profile "Akun Asli" dan "Sekretaris".
   */
  private buildSecretaryProfileContext(
    tuRoles: string[],
    activeProfile?: 'akun_asli' | 'sekretaris',
  ): {
    has_secretary_delegation: boolean;
    available_profiles: string[];
    active_profile: 'akun_asli' | 'sekretaris';
  } {
    const hasSecretary = tuRoles.includes('sekretaris');
    const availableProfiles = hasSecretary
      ? ['akun_asli', 'sekretaris']
      : ['akun_asli'];
    // Default 'akun_asli'; hanya valid jika user memang punya delegasi sekretaris.
    const resolved =
      hasSecretary && activeProfile === 'sekretaris'
        ? 'sekretaris'
        : 'akun_asli';
    return {
      has_secretary_delegation: hasSecretary,
      available_profiles: availableProfiles,
      active_profile: resolved,
    };
  }

  /**
   * Gunakan NIK bersama untuk seluruh integrasi BSrE.
   * noWa tidak di-fetch karena data kosong/tidak tersedia
   * @param persnum - Persnum user
   * @param accessToken - AirNav access token
   * @returns Object containing nik (noWa selalu null)
   */
  private async fetchUserPersonalData(
    persnum: number,
    _accessToken: string,
  ): Promise<{ nik: string | null; noWa: string | null }> {
    console.log(`[AuthService] Using shared BSrE NIK for persnum: ${persnum}`);

    // noWa tidak di-fetch karena data kosong/tidak tersedia
    // Field tetap ada untuk compatibility
    return { nik: DEFAULT_BSRE_NIK, noWa: null };
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
          redirect_uri: 'http://localhost:3000/autharsipku',
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
      console.error("AirNav login error:", err.message);
      throw new UnauthorizedException({
        error: 'Failed to login to AirNav',
        message: err.message, // Send actual error message to mobile
        details: {
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
    const {
      id,
      accessToken: access_token,
      refreshToken: refresh_token,
      expireToken: expired_token,
    } = airnavResponse;
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

    const rbacCtx = await this.buildRbacContext(persnum);
    const role = rbacCtx.role || legacyRole;

    // Build tambahan role dari organization_tu (Unit TU)
    const tuRoles = await this.buildTuRoles(persnum);

    // ================================================================
    // 4. Fetch NIK dan noWa dari HR API (parallel)
    // ================================================================
    const personalData = await this.fetchUserPersonalData(
      persnum,
      access_token,
    );
    console.log(
      '[AuthService] Personal data fetched - NIK:',
      personalData.nik ? 'found' : 'not found',
      ', noWa:',
      personalData.noWa ? 'found' : 'not found',
    );

    // ================================================================
    // 5. Build JWT payload
    // ================================================================
    const secretaryCtx = this.buildSecretaryProfileContext(tuRoles);
    const payload: JwtPayload = {
      persnum: orgData.persnum,
      nama: orgData.nama || '',
      role: role,
      activeRole: rbacCtx.activeRole ?? undefined,
      activePermissions: rbacCtx.activePermissions,
      roles: rbacCtx.roles,
      tuRoles: tuRoles.length > 0 ? tuRoles : undefined,
      has_secretary_delegation: secretaryCtx.has_secretary_delegation,
      available_profiles: secretaryCtx.available_profiles,
      active_profile: secretaryCtx.active_profile,

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
    recordLoginAudit = false,
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

    const rbacCtx = await this.buildRbacContext(persnum);
    const role = rbacCtx.role || legacyRole;
    console.log('[AuthService] User role (final):', role);

    // Build tambahan role dari organization_tu (Unit TU)
    const tuRoles = await this.buildTuRoles(persnum);

    // ================================================================
    // 4. Fetch NIK dan noWa dari HR API (parallel)
    // ================================================================
    const personalData = await this.fetchUserPersonalData(
      persnum,
      ssoResponse.data.access_token,
    );
    console.log(
      '[AuthService] Personal data fetched - NIK:',
      personalData.nik ? 'found' : 'not found',
      ', noWa:',
      personalData.noWa ? 'found' : 'not found',
    );

    // ================================================================
    // 5. Build JWT payload
    // ================================================================
    const secretaryCtx = this.buildSecretaryProfileContext(tuRoles);
    const payload: JwtPayload = {
      persnum: orgData.persnum,
      nama: orgData.nama || '',
      role: role,
      activeRole: rbacCtx.activeRole ?? undefined,
      activePermissions: rbacCtx.activePermissions,
      roles: rbacCtx.roles,
      tuRoles: tuRoles.length > 0 ? tuRoles : undefined,
      has_secretary_delegation: secretaryCtx.has_secretary_delegation,
      available_profiles: secretaryCtx.available_profiles,
      active_profile: secretaryCtx.active_profile,

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

    console.log(
      '[AuthService] JWT generated, expires in:',
      expiresIn,
      'seconds',
    );

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

    if (recordLoginAudit) {
      this.recordLoginAudit(
        payload,
        session.id,
        userAgent,
        ip,
        'GET',
        '/auth/autharsipku',
      );
    }

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
   * Mulai Authorization Code Flow + PKCE. State dan verifier hanya disimpan
   * di server; browser menerima opaque session id lewat cookie HttpOnly.
   */
  async beginOidcLogin(
    returnTo?: string,
    frontendOrigin?: string,
  ): Promise<{
    sessionId: string;
    url: string;
  }> {
    const sessionId = generateOidcSessionId();
    const codeVerifier = generateCodeVerifier();
    const resolvedFrontendOrigin = this.sanitizeFrontendOrigin(frontendOrigin);
    const flowType = this.isLocalFrontend(resolvedFrontendOrigin)
      ? 'local'
      : resolvedFrontendOrigin === 'mobile'
        ? 'mobile'
        : 'server';
    // Khusus mobile WebView (yang kerap memblokir third-party cookies di iOS),
    // sisipkan sessionId ke dalam state agar callback dapat memulihkan pending session tanpa cookie.
    const state =
      resolvedFrontendOrigin === 'mobile'
        ? `${flowType}.${generateOidcState()}.${sessionId}`
        : `${flowType}.${generateOidcState()}`;
    const session: OidcServerSession = {
      state,
      codeVerifier,
      returnTo: this.sanitizeReturnTo(returnTo),
      frontendOrigin: resolvedFrontendOrigin,
      createdAt: Date.now(),
    };

    await this.oidcSessionService.create(sessionId, session);
    return {
      sessionId,
      url: this.airnavAuthV2Client.getAuthorizationUrl({
        redirectUri: this.getOidcRedirectUri(),
        state,
        codeChallenge: generateCodeChallenge(codeVerifier),
      }),
    };
  }

  /** Tukar code provider dan buat sesi internal ArsipKu. */
  async completeOidcLogin(
    pendingSessionId: string,
    code: string,
    state: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{
    sessionId: string;
    returnTo: string;
    frontendOrigin?: string;
  }> {
    const pending = await this.oidcSessionService.get(pendingSessionId);
    if (!pending || pending.appSessionId) {
      throw new UnauthorizedException(
        'Transaksi login tidak ditemukan atau sudah kedaluwarsa',
      );
    }
    // Pending session hanya boleh dipakai dalam window singkat (10 menit).
    // Tanpa ini, sesi pending lama bisa dipakai menyelesaikan login basi.
    const PENDING_TTL_MS = 10 * 60 * 1000;
    if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
      await this.oidcSessionService.delete(pendingSessionId);
      throw new UnauthorizedException(
        'Transaksi login sudah kedaluwarsa, silakan login ulang',
      );
    }
    if (!safeStateEquals(pending.state, state)) {
      throw new BadRequestException('State callback tidak valid');
    }

    // State dan authorization code hanya boleh digunakan satu kali.
    await this.oidcSessionService.delete(pendingSessionId);

    const tokenData = await this.airnavAuthV2Client.exchangeCode({
      code,
      redirectUri: this.getOidcRedirectUri(),
      codeVerifier: pending.codeVerifier,
    });
    const userInfo = await this.airnavAuthV2Client.getUserInfo(
      tokenData.accessToken,
    );
    const persnum = this.resolveOidcPersnum(userInfo);
    const payload = await this.buildApplicationPayload(
      persnum,
      tokenData.accessToken,
    );
    const refreshExpiry = this.resolveOidcRefreshExpiry(
      tokenData.refreshTokenExpiresAt,
    );
    const appSession = await this.sessionService.createSession(persnum, {
      airnavAccessToken: tokenData.accessToken,
      airnavRefreshToken: tokenData.refreshToken,
      airnavExpiredAt: refreshExpiry,
      idPosition: payload.position ? Number(payload.position) : undefined,
      userAgent,
      ipAddress: ip,
    });

    try {
      await this.oidcSessionService.create(appSession.id, {
        ...pending,
        codeVerifier: '',
        appSessionId: appSession.id,
        persnum,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        idToken: tokenData.idToken,
        accessTokenExpiresAt: Date.now() + tokenData.expiresIn * 1000,
        refreshTokenExpiresAt: refreshExpiry.toISOString(),
      });
    } catch (error) {
      await this.sessionService.deleteSessionById(appSession.id);
      throw error;
    }

    this.recordLoginAudit(
      payload,
      appSession.id,
      userAgent,
      ip,
      'GET',
      '/auth/callback',
    );

    return {
      sessionId: appSession.id,
      returnTo: pending.returnTo,
      frontendOrigin: pending.frontendOrigin,
    };
  }

  /**
   * Pulihkan JWT aplikasi dari cookie sesi Auth v2. Provider access/refresh
   * token tidak pernah dikirim ke browser.
   */
  async getOidcBrowserSession(sessionId: string): Promise<{
    accessToken: string;
    expiredToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const oidcSession = await this.requireOidcSession(sessionId);
    if (
      !oidcSession.accessTokenExpiresAt ||
      oidcSession.accessTokenExpiresAt <= Date.now() + 60_000
    ) {
      return this.refreshOidcBrowserSession(sessionId);
    }

    const appSession = await this.sessionService.findSession(sessionId);
    if (!appSession || appSession.userPersnum !== oidcSession.persnum) {
      await this.oidcSessionService.delete(sessionId);
      throw new UnauthorizedException('Sesi ArsipKu tidak valid');
    }

    const user = await this.buildApplicationPayload(
      appSession.userPersnum,
      oidcSession.accessToken!,
    );
    const expiresIn = Math.max(
      1,
      Math.floor((oidcSession.accessTokenExpiresAt - Date.now()) / 1000),
    );
    const accessToken = await this.jwtService.signAsync(user, { expiresIn });
    return {
      accessToken,
      expiredToken: new Date(oidcSession.accessTokenExpiresAt).toISOString(),
      sessionId,
      user,
    };
  }

  refreshOidcBrowserSession(
    sessionId: string,
    previousAppToken?: string,
  ): Promise<{
    accessToken: string;
    expiredToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const inflight = this.oidcRefreshRequests.get(sessionId);
    if (inflight) return inflight;

    const request = this.performOidcBrowserRefresh(
      sessionId,
      previousAppToken,
    ).finally(() => {
      if (this.oidcRefreshRequests.get(sessionId) === request) {
        this.oidcRefreshRequests.delete(sessionId);
      }
    });
    this.oidcRefreshRequests.set(sessionId, request);
    return request;
  }

  async logoutOidcBrowserSession(
    sessionId?: string,
    context: { requestMethod?: string; requestUrl?: string } = {},
  ): Promise<void> {
    if (!sessionId) return;
    const oidcSession = await this.oidcSessionService.get(sessionId);
    const appSession = await this.sessionService.findSession(sessionId);
    const providerToken =
      oidcSession?.accessToken ?? appSession?.airnavAccessToken;

    if (appSession) {
      this.recordLogoutAudit(
        appSession,
        context.requestMethod ?? 'GET',
        context.requestUrl ?? '/auth/logout',
      );
    }

    try {
      if (providerToken) await this.airnavAuthV2Client.logout(providerToken);
    } catch (error) {
      console.warn('[AuthService] Logout Auth v2 upstream gagal', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.oidcSessionService.delete(sessionId);
      await this.sessionService.deleteSessionById(sessionId);
    }
  }

  /** Catat logout sebelum sesi dihapus dari database. */
  private recordLogoutAudit(
    session: {
      id: string;
      userPersnum: number;
      userAgent?: string | null;
      ipAddress?: string | null;
    },
    requestMethod: string,
    requestUrl: string,
  ): void {
    this.auditTrailService.createAsync({
      action: AuditAction.LOGOUT,
      module: AuditModule.AUTH,
      persnum: session.userPersnum,
      description: `Logout oleh ${session.userPersnum} pada modul AUTH`,
      newValue: {
        timestamp: new Date().toISOString(),
        ipAddress: session.ipAddress ?? null,
      },
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      requestMethod,
      requestUrl,
      status: AuditStatus.SUCCESS,
      metadata: {
        action: AuditAction.LOGOUT,
        module: AuditModule.AUTH,
        method: requestMethod,
        path: requestUrl,
        sessionId: session.id,
        source: 'auth-session-deleted',
      },
    });
  }

  private async performOidcBrowserRefresh(
    sessionId: string,
    previousAppToken?: string,
  ): Promise<{
    accessToken: string;
    expiredToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const oidcSession = await this.requireOidcSession(sessionId);
    const appSession = await this.sessionService.findSession(sessionId);
    if (!appSession || appSession.userPersnum !== oidcSession.persnum) {
      throw new UnauthorizedException('Sesi ArsipKu tidak valid');
    }

    let previousPayload: JwtPayload | undefined;
    if (previousAppToken) {
      try {
        previousPayload = this.jwtService.verify<JwtPayload>(previousAppToken, {
          ignoreExpiration: true,
        });
      } catch {
        // Token aplikasi dapat menjadi stale setelah restart/deploy atau saat
        // pengguna berpindah antara instance lokal dan server. Sesi Auth v2
        // (cookie HttpOnly) adalah sumber kebenaran yang sudah diverifikasi di
        // atas, jadi token lama tidak boleh membuat sesi valid ikut logout.
        // Bangun payload baru dari data sesi setelah refresh provider selesai.
        previousPayload = undefined;
      }
      if (
        previousPayload &&
        previousPayload.persnum !== appSession.userPersnum
      ) {
        throw new UnauthorizedException('Token tidak terkait dengan sesi');
      }
    }

    const tokenData = await this.airnavAuthV2Client.refreshToken(
      oidcSession.refreshToken!,
    );
    const refreshExpiry = this.resolveOidcRefreshExpiry(
      tokenData.refreshTokenExpiresAt,
      appSession.airnavExpiredAt,
    );
    const rotated = await this.sessionService.rotateOidcTokens(
      sessionId,
      oidcSession.refreshToken!,
      {
        airnavAccessToken: tokenData.accessToken,
        airnavRefreshToken: tokenData.refreshToken,
        airnavExpiredAt: refreshExpiry,
      },
    );
    if (!rotated) {
      throw new UnauthorizedException(
        'Refresh token telah digunakan oleh request lain',
      );
    }

    const updated: OidcServerSession = {
      ...oidcSession,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      idToken: tokenData.idToken ?? oidcSession.idToken,
      accessTokenExpiresAt: Date.now() + tokenData.expiresIn * 1000,
      refreshTokenExpiresAt: refreshExpiry.toISOString(),
    };
    await this.oidcSessionService.update(sessionId, updated);

    const user = previousPayload
      ? await this.buildOidcRefreshPayload(
          previousPayload,
          tokenData.accessToken,
        )
      : await this.buildApplicationPayload(
          appSession.userPersnum,
          tokenData.accessToken,
        );
    const accessToken = await this.jwtService.signAsync(user, {
      expiresIn: tokenData.expiresIn,
    });
    return {
      accessToken,
      expiredToken: new Date(updated.accessTokenExpiresAt!).toISOString(),
      sessionId,
      user,
    };
  }

  private async requireOidcSession(
    sessionId: string,
  ): Promise<OidcServerSession> {
    const session = await this.oidcSessionService.get(sessionId);
    if (
      !session?.appSessionId ||
      !session.accessToken ||
      !session.refreshToken ||
      !session.persnum
    ) {
      throw new UnauthorizedException(
        'Sesi Auth v2 tidak ditemukan atau sudah kedaluwarsa',
      );
    }
    return session;
  }

  private getOidcRedirectUri(): string {
    const redirectUri =
      this.configService.get<string>('AUTH_REDIRECT_URI') ||
      this.configService.get<string>('AIRNAV_OIDC_REDIRECT_URI');
    if (!redirectUri) {
      throw new BadRequestException('AUTH_REDIRECT_URI belum dikonfigurasi');
    }
    return redirectUri;
  }

  private sanitizeReturnTo(returnTo?: string): string {
    if (
      !returnTo ||
      !returnTo.startsWith('/') ||
      returnTo.startsWith('//') ||
      returnTo.startsWith('/auth') ||
      returnTo.includes('\\')
    ) {
      return '/beranda';
    }
    return returnTo;
  }

  private sanitizeFrontendOrigin(frontendOrigin?: string): string {
    if (frontendOrigin === 'mobile') {
      return 'mobile';
    }

    const configuredOrigins = [
      this.configService.get<string>('AUTH_FRONTEND_URL'),
      this.configService.get<string>('FRONTEND_URL'),
    ]
      .flatMap((value) => (value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    if (frontendOrigin) {
      try {
        const requestedOrigin = new URL(frontendOrigin).origin;
        if (configuredOrigins.includes(requestedOrigin)) return requestedOrigin;
      } catch {
        // Gunakan origin default yang sudah dikonfigurasi.
      }
    }

    return configuredOrigins[0] || 'http://localhost:3000';
  }

  private isLocalFrontend(frontendOrigin: string): boolean {
    if (frontendOrigin === 'mobile') return false;
    try {
      const hostname = new URL(frontendOrigin).hostname;
      return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
      );
    } catch {
      return false;
    }
  }

  private resolveOidcPersnum(userInfo: OidcUserInfo): number {
    const raw = String(
      userInfo.employee_no ??
        userInfo.employeeNo ??
        userInfo.preferred_username ??
        userInfo.username ??
        userInfo.sub ??
        '',
    ).trim();
    if (!/^\d+$/.test(raw)) {
      throw new UnauthorizedException(
        'Identitas AirNav Auth tidak dapat dipetakan ke persnum',
      );
    }
    return Number(raw);
  }

  private resolveOidcRefreshExpiry(value?: string, fallback?: Date): Date {
    const parsed = value ? new Date(value) : null;
    if (parsed && !Number.isNaN(parsed.getTime()) && parsed > new Date()) {
      return parsed;
    }
    if (fallback && fallback > new Date()) return fallback;
    const seconds = Number(
      this.configService.get<string>('AUTH_SESSION_TTL_SECONDS', '28800'),
    );
    return new Date(
      Date.now() +
        (Number.isFinite(seconds) && seconds > 0 ? seconds : 28800) * 1000,
    );
  }

  private async buildApplicationPayload(
    persnum: number,
    providerAccessToken: string,
  ): Promise<JwtPayload> {
    const orgData = await this.orgDataService.findByPersnum(persnum);
    if (!orgData) {
      throw new UnauthorizedException(
        'User tidak terdaftar di sistem organisasi',
      );
    }
    const userRole = await this.userRoleRepo.findOne({ where: { persnum } });
    const rbacCtx = await this.buildRbacContext(persnum);
    const role = rbacCtx.role || userRole?.role || 'user';
    const tuRoles = await this.buildTuRoles(persnum);
    const personalData = await this.fetchUserPersonalData(
      persnum,
      providerAccessToken,
    );

    return {
      persnum: orgData.persnum,
      nama: orgData.nama || '',
      role,
      activeRole: rbacCtx.activeRole ?? undefined,
      activePermissions: rbacCtx.activePermissions,
      roles: rbacCtx.roles,
      tuRoles: tuRoles.length > 0 ? tuRoles : undefined,
      ...this.buildSecretaryProfileContext(tuRoles),
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
  }

  private async buildOidcRefreshPayload(
    previousPayload: JwtPayload,
    providerAccessToken: string,
  ): Promise<JwtPayload> {
    const fresh = await this.buildApplicationPayload(
      previousPayload.persnum,
      providerAccessToken,
    );
    if (!isDelegatedActor(previousPayload)) {
      return {
        ...fresh,
        ...this.buildSecretaryProfileContext(
          fresh.tuRoles ?? [],
          previousPayload.active_profile,
        ),
      };
    }

    const { exp: _exp, iat: _iat, ...delegated } = previousPayload as any;
    let activePermissions = fresh.activePermissions;
    if (previousPayload.delegator_persnum) {
      activePermissions = (
        await this.buildRbacContext(previousPayload.delegator_persnum)
      ).activePermissions;
    }
    return {
      ...delegated,
      role: fresh.role,
      activeRole: fresh.activeRole,
      activePermissions,
      roles: fresh.roles,
      tuRoles: fresh.tuRoles,
      ...this.buildSecretaryProfileContext(
        fresh.tuRoles ?? [],
        previousPayload.active_profile,
      ),
      nik: fresh.nik,
      noWa: fresh.noWa,
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
    console.log(
      '[AuthService] Access token (first 50 chars):',
      session.airnavAccessToken?.substring(0, 50),
    );

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
      console.error(
        '[AuthService] Failed to refresh AirNav token:',
        err.message,
      );
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

    const rbacCtx = await this.buildRbacContext(payload.persnum);
    const role = rbacCtx.role || legacyRole;

    // Build fresh TU roles dari organization_tu
    const tuRoles = await this.buildTuRoles(payload.persnum);

    // Fetch fresh NIK dan noWa dari HR API
    const personalData = await this.fetchUserPersonalData(
      payload.persnum,
      ssoRefresh.accessToken,
    );

    // Preserve delegation context across refresh (spec D5). When the decoded token
    // has an active delegated actor, carry position_status + delegator_persnum +
    // the delegated org-scope fields forward; refresh RBAC fresh by the delegate's
    // own persnum so the SUPERADMIN bypass stays tied to the delegate (spec D4).
    const { exp: _oldExp, iat: _oldIat, ...delegatedCtx } = payload as any;
    const isDelegated = isDelegatedActor(payload);

    // activePermissions = delegator's when delegated (FE Tulis menu shows the
    // delegator's naskah types); activeRole/role/roles stay the delegate's own (D4).
    let effectiveActivePermissions = rbacCtx.activePermissions;
    if (isDelegated && payload.delegator_persnum) {
      try {
        const delegatorRbac = await this.buildRbacContext(
          payload.delegator_persnum,
        );
        effectiveActivePermissions = delegatorRbac.activePermissions;
      } catch (e) {
        console.warn(
          '[AuthService] refreshWithSession: failed to resolve delegator RBAC, keeping delegate perms:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    const newPayload: JwtPayload = isDelegated
      ? {
          ...delegatedCtx, // position_status, delegator_persnum, delegated org scope, persnum, nama, bodTag, abbreviation, atasan_langsung
          role: role,
          activeRole: rbacCtx.activeRole ?? undefined,
          activePermissions: effectiveActivePermissions,
          roles: rbacCtx.roles,
          tuRoles: tuRoles.length > 0 ? tuRoles : undefined,
          ...this.buildSecretaryProfileContext(tuRoles, payload.active_profile),
          nik: personalData.nik || undefined,
          noWa: personalData.noWa || undefined,
        }
      : {
          persnum: orgData.persnum,
          nama: orgData.nama || '',
          role: role,
          activeRole: rbacCtx.activeRole ?? undefined,
          activePermissions: rbacCtx.activePermissions,
          roles: rbacCtx.roles,
          tuRoles: tuRoles.length > 0 ? tuRoles : undefined,
          ...this.buildSecretaryProfileContext(tuRoles, payload.active_profile),
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
  /**
   * Resolve the delegator's context (activePermissions + bodTag/abbreviation/atasan_langsung)
   * from RBAC + org_data. Falls back to the delegate's own values on lookup failure.
   * Used by switchRole so the FE Tulis menu + tulis-access middleware reflect the delegator.
   */
  private async resolveDelegatorContext(
    delegatorPersnum: string | undefined,
    base: {
      activePermissions?: any[];
      bodTag?: string;
      abbreviation?: string;
      atasan_langsung?: any;
    },
  ): Promise<{
    activePermissions: any[];
    bodTag: string;
    abbreviation: string;
    atasan_langsung: any;
  }> {
    let activePermissions = base.activePermissions ?? [];
    let bodTag = base.bodTag ?? '';
    let abbreviation = base.abbreviation ?? '';
    let atasan_langsung = base.atasan_langsung ?? null;
    if (delegatorPersnum) {
      try {
        const rbac = await this.buildRbacContext(Number(delegatorPersnum));
        activePermissions = rbac.activePermissions ?? [];
      } catch (e) {
        console.warn(
          '[AuthService] resolveDelegatorContext: RBAC failed, keeping delegate:',
          e instanceof Error ? e.message : String(e),
        );
      }
      try {
        const org = await this.orgDataService.findByPersnum(
          Number(delegatorPersnum),
        );
        if (org) {
          bodTag = org.bodTag || base.bodTag;
          abbreviation = org.abbreviation || base.abbreviation;
          atasan_langsung = org.atasan_langsung ?? base.atasan_langsung;
        }
      } catch (e) {
        console.warn(
          '[AuthService] resolveDelegatorContext: org_data failed, keeping delegate:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }
    return { activePermissions, bodTag, abbreviation, atasan_langsung };
  }

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
      // Resolve delegator's RBAC permissions so the FE Tulis menu (hasPermission)
      // Resolve delegator's context (activePermissions + bodTag + abbreviation + atasan_langsung)
      // so the FE Tulis menu (bodTag filter) + hasPermission (activePermissions) reflect the delegator.
      const ctx = await this.resolveDelegatorContext(
        delegasi.persnum,
        basePayload,
      );

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
        // Delegator's context (activePermissions + bodTag + abbreviation + atasan_langsung).
        // activeRole/role = delegate's own (D4 — bypass not inherited).
        activePermissions: ctx.activePermissions,
        bodTag: ctx.bodTag,
        abbreviation: ctx.abbreviation,
        atasan_langsung: ctx.atasan_langsung,
      };
    } else {
      // Reset to original role - fetch from org_data
      const orgData = await this.orgDataService.findByPersnum(
        basePayload.persnum,
      );

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

    console.log(
      '[AuthService] Switching company to:',
      companySwitchData.companyText,
    );
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
