import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../user/services/user.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';
import { AppJwtPayload } from '../interface/app-jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  // ============================================================
  // LOGIN SSO → SIMPAN SESSION → RETURN JWT + SESSION ID
  // ============================================================
  async loginWithSsoToken(ssoToken: string, userAgent?: string, ip?: string) {
    const verifyUrl = this.configService.get('SSO_VERIFY_URL');

    let ssoResponse;
    try {
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
    } catch (err) {
      const raw = {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        headers: err.response?.headers,
      };
      throw new UnauthorizedException({
        error: 'Failed to verify SSO token',
        raw,
      });
    }

    if (!ssoResponse.validToken || ssoResponse.responStatus !== 200) {
      throw new UnauthorizedException('Invalid SSO token');
    }

    const persnum = Number(ssoResponse.data.id);
    // const user = await this.userService.findByPersnum(persnum);
    const { user, detail } = await this.userService.findUserAndDetail(persnum);

    const payload: AppJwtPayload = {
      id: user.id,
      persnum: user.persnum,
      name: user.name,
      rolelId: user.roleId ?? null,
      role: user.role?.name ?? null,
      channelId: user.channelId ?? null,
      channel: user.channel?.name ?? null,

      company: detail?.company ?? null,
      companyText: detail?.companyText ?? null,
      area: detail?.area ?? null,
      areaText: detail?.areaText ?? null,
      subArea: detail?.subArea ?? null,
      subAreaText: detail?.subAreaText ?? null,
      organization: detail?.organization ?? null,
      organizationText: detail?.organizationText ?? null,
      position: detail?.position ?? null,
      positionText: detail?.positionText ?? null,
    };

    const jwt = await this.jwtService.signAsync(payload);

    // ===========================
    // Save Session
    // ===========================
    const session = await this.sessionService.createSession(user.persnum, {
      airnavAccessToken: ssoResponse.data.access_token,
      airnavRefreshToken: ssoResponse.data.refresh_token,
      airnavExpiredAt: new Date(ssoResponse.data.expired_token),
      userAgent,
      ipAddress: ip,
    });

    return {
      message: 'Login success',
      accessToken: jwt,
      expiredToken: ssoResponse.data.expired_token,
      refreshToken: ssoResponse.data.refresh_token,
      sessionId: session.id,
      payload,
    };
  }

  // ============================================================
  // REFRESH TOKEN
  // ============================================================
  async refreshWithSession(sessionId: string, appToken: string) {
    // Lazy delete expired
    await this.sessionService.deleteExpiredSessions();

    const session = await this.sessionService.findSession(sessionId);
    if (!session) throw new UnauthorizedException('Session not found');

    if (session.airnavExpiredAt < new Date()) {
      throw new UnauthorizedException('SSO session expired');
    }

    // ===================================
    // CALL REFRESH ENDPOINT AIRNAV
    // ===================================
    const refreshUrl = this.configService.get('SSO_REFRESH_URL');

    let ssoRefresh;
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
    } catch {
      throw new UnauthorizedException('Failed to refresh SSO token');
    }

    // ===================================
    // UPDATE SESSION
    // ===================================
    await this.sessionService.updateSession(sessionId, {
      airnavAccessToken: ssoRefresh.accessToken,
      airnavRefreshToken: ssoRefresh.refreshToken,
      airnavExpiredAt: new Date(ssoRefresh.expireToken),
    });

    // ===================================
    // DECODE OLD JWT → GENERATE JWT BARU
    // ===================================
    let payload;
    try {
      payload = this.jwtService.verify(appToken, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException('Invalid application token');
    }

    const { user, detail } = await this.userService.findUserAndDetail(payload.persnum);

    const payloadRefresh: AppJwtPayload = {
      id: user.id,
      persnum: user.persnum,
      name: user.name,
      rolelId: user.roleId ?? null,
      role: user.role?.name ?? null,
      channelId: user.channelId ?? null,
      channel: user.channel?.name ?? null,

      company: detail?.company ?? null,
      companyText: detail?.companyText ?? null,
      area: detail?.area ?? null,
      areaText: detail?.areaText ?? null,
      subArea: detail?.subArea ?? null,
      subAreaText: detail?.subAreaText ?? null,
      organization: detail?.organization ?? null,
      organizationText: detail?.organizationText ?? null,
      position: detail?.position ?? null,
      positionText: detail?.positionText ?? null,
    };

    const newJwt = await this.jwtService.signAsync(payloadRefresh, {
      expiresIn: Math.floor((new Date(ssoRefresh.expireToken).getTime() - Date.now()) / 1000),
    });

    return {
      message: 'Refresh token success',
      accessToken: newJwt,
      expiredToken: ssoRefresh.expireToken,
      refreshToken: ssoRefresh.refreshToken,
      sessionId,
      payloadRefresh,
    };
  }

  async getUserProfileByPersnum(persnum: number) {
    const user = await this.userService.findByPersnum(persnum);
    return user;
  }
}
