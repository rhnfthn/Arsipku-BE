import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './session.service';
import { UserRoleEntity } from '../../admin/entities/user-role.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import {
  JwtPayload,
  AirNavTokenResponse,
  AirNavRefreshResponse,
} from '../interfaces/jwt-payload.interface';

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
  ) {}

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
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      const res = await firstValueFrom(req);
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
    if (!airnavResponse || airnavResponse.responseStatus !== 200) {
      throw new UnauthorizedException({
        error: 'Invalid credentials',
        message: airnavResponse?.message || 'Login failed',
      });
    }

    // Extract data dari response AirNav
    const { id, access_token, refresh_token, expired_token } = airnavResponse;
    const persnum = Number(id);

    // ================================================================
    // 2. Check user di org_data
    // ================================================================
    const orgData = await this.orgDataService.findByPersnum(persnum);

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

    const role = userRole?.role || 'user';

    // ================================================================
    // 4. Build JWT payload
    // ================================================================
    const payload: JwtPayload = {
      persnum: orgData.persnum,
      role: role as 'user' | 'admin' | 'superadmin',

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
    };

    // ================================================================
    // 5. Generate JWT (expires sync dengan AirNav token)
    // ================================================================
    const expiresIn = Math.floor(
      (new Date(expired_token).getTime() - Date.now()) / 1000,
    );

    const jwt = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn > 0 ? expiresIn : 86400, // fallback 24 jam
    });

    // ================================================================
    // 6. Save session
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

    const role = userRole?.role || 'user';
    console.log('[AuthService] User role:', role);

    // ================================================================
    // 4. Build JWT payload
    // ================================================================
    const payload: JwtPayload = {
      persnum: orgData.persnum,
      role: role as 'user' | 'admin' | 'superadmin',

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
    };

    // ================================================================
    // 5. Generate JWT (expires sync dengan AirNav token)
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
    // 6. Save session
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

    const role = userRole?.role || 'user';

    const newPayload: JwtPayload = {
      persnum: orgData.persnum,
      role: role as 'user' | 'admin' | 'superadmin',

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
}
