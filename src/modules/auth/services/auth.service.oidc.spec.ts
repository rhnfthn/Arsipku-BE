import { of } from 'rxjs';
import { AuthService } from './auth.service';

describe('AuthService OIDC/PKCE', () => {
  let service: AuthService;
  let httpService: any;
  let sessionService: any;
  let jwtService: any;

  const configValues: Record<string, string> = {
    AIRNAV_OIDC_BASE_URL: 'https://auth.example.test/v2',
    AIRNAV_OIDC_CLIENT_ID: 'arsipku-client',
    AIRNAV_OIDC_CLIENT_SECRET: 'server-only-secret',
    AIRNAV_OIDC_REDIRECT_URI: 'https://arsipku.example.test/auth/callback',
    AIRNAV_OIDC_SCOPE: 'openid profile email',
  };

  const orgData = {
    persnum: 12345,
    nama: 'User AirNav',
    company: 1,
    companyText: 'AirNav Indonesia',
    area: 'A',
    areaText: 'Area A',
    subArea: 2,
    subAreaText: 'Sub Area',
    organization: 3,
    organizationText: 'Organization',
    position: 4,
    positionText: 'Staff',
    bodTag: '',
    abbreviation: 'STF',
    atasan_langsung: null,
  };

  beforeEach(() => {
    jwtService = {
      signAsync: jest.fn(async () => 'arsipku-jwt'),
      verify: jest.fn(() => ({ ...orgData, role: 'user' })),
    };
    httpService = {
      post: jest.fn(),
      get: jest.fn(),
    };
    sessionService = {
      createSession: jest.fn(async () => ({ id: 'session-id' })),
      findSession: jest.fn(async () => ({
        id: 'session-id',
        userPersnum: 12345,
        airnavAccessToken: 'provider-access-old',
        airnavRefreshToken: 'provider-refresh-old',
        airnavExpiredAt: new Date(Date.now() + 86_400_000),
      })),
      rotateOidcTokens: jest.fn(async () => true),
      deleteSessionById: jest.fn(),
    };

    service = new AuthService(
      jwtService,
      httpService,
      { get: jest.fn((key: string) => configValues[key]) } as any,
      sessionService,
      { findByPersnum: jest.fn(async () => orgData) } as any,
      { findOne: jest.fn(async () => null) } as any,
      {
        buildActiveRoleAndPermissions: jest.fn(async () => ({
          activeRole: { id: 'role-user', name: 'USER' },
          activePermissions: [],
          roles: [{ id: 'role-user', name: 'USER' }],
          role: 'user',
        })),
      } as any,
      { getActiveRolesForPersnum: jest.fn(async () => []) } as any,
    );
  });

  it('hanya mengekspos konfigurasi publik tanpa client secret', () => {
    expect(service.getOidcClientConfig()).toEqual({
      authorizeUrl: 'https://auth.example.test/v2/sso/authorize',
      clientId: 'arsipku-client',
      redirectUri: 'https://arsipku.example.test/auth/callback',
      scope: 'openid profile email',
    });
    expect(service.getOidcClientConfig()).not.toHaveProperty('clientSecret');
  });

  it('menukar code dengan PKCE dan tidak mengirim provider refresh token ke browser', async () => {
    httpService.post.mockReturnValueOnce(
      of({
        data: {
          access_token: 'provider-access',
          refresh_token: 'provider-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: 'provider-id-token',
          scope: 'openid profile email',
        },
      }),
    );
    httpService.get.mockReturnValueOnce(
      of({ data: { employee_no: '12345', name: 'User AirNav' } }),
    );

    const result = await service.loginWithOidcCode(
      'authorization-code',
      'a'.repeat(64),
      'test-agent',
      '127.0.0.1',
    );

    const exchangeBody = httpService.post.mock.calls[0][1] as string;
    expect(exchangeBody).toContain('grant_type=authorization_code');
    expect(exchangeBody).toContain('code=authorization-code');
    expect(exchangeBody).toContain(`code_verifier=${'a'.repeat(64)}`);
    expect(exchangeBody).toContain('client_secret=server-only-secret');
    expect(sessionService.createSession).toHaveBeenCalledWith(
      12345,
      expect.objectContaining({
        airnavAccessToken: 'provider-access',
        airnavRefreshToken: 'provider-refresh',
      }),
    );
    expect(result).toMatchObject({
      accessToken: 'arsipku-jwt',
      sessionId: 'session-id',
    });
    expect(result).not.toHaveProperty('refreshToken');
  });

  it('menggabungkan refresh paralel dan menyimpan pasangan token dengan compare-and-swap', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          access_token: 'provider-access-new',
          refresh_token: 'provider-refresh-new',
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: 'provider-id-token-new',
        },
      }),
    );

    const first = service.refreshOidcWithSession(
      'session-id',
      'expired-app-jwt',
    );
    const second = service.refreshOidcWithSession(
      'session-id',
      'expired-app-jwt',
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.post.mock.calls[0][0]).toBe(
      'https://auth.example.test/v2/sso/token',
    );
    const refreshBody = httpService.post.mock.calls[0][1] as string;
    expect(refreshBody).toContain('grant_type=refresh_token');
    expect(refreshBody).toContain('refresh_token=provider-refresh-old');
    expect(refreshBody).toContain('client_id=arsipku-client');
    expect(sessionService.rotateOidcTokens).toHaveBeenCalledWith(
      'session-id',
      'provider-refresh-old',
      expect.objectContaining({
        airnavAccessToken: 'provider-access-new',
        airnavRefreshToken: 'provider-refresh-new',
      }),
    );
    expect(firstResult.accessToken).toBe('arsipku-jwt');
    expect(secondResult).toBe(firstResult);
  });
});
