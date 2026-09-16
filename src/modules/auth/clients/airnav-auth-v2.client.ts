import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { OidcTokenSet, OidcUserInfo } from '../interfaces/oidc.interface';
import { parseExpiresIn } from '../utils/token.util';

interface OidcTokenWireData {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  idToken?: string;
  id_token?: string;
  tokenType?: string;
  token_type?: string;
  expiresIn?: number | string;
  expires_in?: number | string;
  refreshTokenExpiresAt?: string;
  refresh_token_expires_at?: string;
}

interface OidcTokenWireResponse extends OidcTokenWireData {
  data?: OidcTokenWireData;
}

interface OidcUserInfoResponse extends OidcUserInfo {
  data?: OidcUserInfo;
}

@Injectable()
export class AirnavAuthV2Client {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scope: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.config(
      'AUTH_BASE_URL',
      'AIRNAV_OIDC_BASE_URL',
      'https://auth.airnavindonesia.co.id/v2',
    ).replace(/\/+$/, '');
    this.clientId = this.config('AUTH_CLIENT_ID', 'AIRNAV_OIDC_CLIENT_ID');
    this.clientSecret = this.config(
      'AUTH_CLIENT_SECRET',
      'AIRNAV_OIDC_CLIENT_SECRET',
    );
    this.scope = this.config(
      'AUTH_SCOPE',
      'AIRNAV_OIDC_SCOPE',
      'openid profile email',
    );
  }

  private config(primary: string, legacy: string, fallback = ''): string {
    return (
      this.configService.get<string>(primary) ||
      this.configService.get<string>(legacy) ||
      fallback
    );
  }

  private assertConfigured(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new InternalServerErrorException(
        'Konfigurasi AUTH_CLIENT_ID/AUTH_CLIENT_SECRET belum lengkap',
      );
    }
  }

  getAuthorizationUrl(params: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string {
    this.assertConfigured();
    const url = new URL(`${this.baseUrl}/sso/authorize`);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('scope', this.scope);
    return url.toString();
  }

  async exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<OidcTokenSet> {
    this.assertConfigured();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code_verifier: params.codeVerifier,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post<OidcTokenWireResponse>(
          `${this.baseUrl}/sso/token`,
          body.toString(),
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 15000,
          },
        ),
      );
      return this.normalizeTokenResponse(response.data);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Log detail respons provider supaya penyebab penolakan (redirect_uri
      // mismatch, code_verifier salah, code expired) terlihat di log server.
      const axiosError = error as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      console.error('[AirnavAuthV2Client] Token exchange gagal:', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });
      throw new UnauthorizedException('Authorization code tidak valid');
    }
  }

  async refreshToken(refreshToken: string): Promise<OidcTokenSet> {
    this.assertConfigured();
    try {
      const response = await firstValueFrom(
        this.httpService.post<OidcTokenWireResponse>(
          `${this.baseUrl}/auth/refresh`,
          { refreshToken },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );
      return this.normalizeTokenResponse(response.data);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token AirNav Auth tidak valid');
    }
  }

  async getUserInfo(accessToken: string): Promise<OidcUserInfo> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<OidcUserInfoResponse>(
          `${this.baseUrl}/sso/userinfo`,
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 15000,
          },
        ),
      );
      return response.data.data ?? response.data;
    } catch {
      throw new UnauthorizedException('Profil AirNav Auth tidak dapat dimuat');
    }
  }

  async logout(accessToken: string): Promise<void> {
    this.assertConfigured();
    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/sso/logout/bearer`,
        { client_id: this.clientId },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 5000,
        },
      ),
    );
  }

  private normalizeTokenResponse(
    response: OidcTokenWireResponse,
  ): OidcTokenSet {
    const data = response.data ?? response;
    const accessToken = data.accessToken ?? data.access_token;
    const refreshToken = data.refreshToken ?? data.refresh_token;
    if (!accessToken || !refreshToken) {
      throw new UnauthorizedException(
        'Response token AirNav Auth tidak lengkap',
      );
    }

    return {
      accessToken,
      refreshToken,
      idToken: data.idToken ?? data.id_token,
      tokenType: data.tokenType ?? data.token_type,
      expiresIn: parseExpiresIn(data.expiresIn ?? data.expires_in),
      refreshTokenExpiresAt:
        data.refreshTokenExpiresAt ?? data.refresh_token_expires_at,
    };
  }
}
