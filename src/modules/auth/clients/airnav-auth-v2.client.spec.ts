import { of } from 'rxjs';
import { AirnavAuthV2Client } from './airnav-auth-v2.client';

describe('AirnavAuthV2Client', () => {
  const http = { post: jest.fn(), get: jest.fn() };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          AUTH_BASE_URL: 'https://auth.example.test/v2',
          AUTH_CLIENT_ID: 'arsipku-client',
          AUTH_CLIENT_SECRET: 'server-secret',
          AUTH_SCOPE: 'openid profile email',
        })[key],
    ),
  };
  let client: AirnavAuthV2Client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AirnavAuthV2Client(http as any, config as any);
  });

  it('membuat authorize URL PKCE tanpa mengekspos client secret', () => {
    const url = new URL(
      client.getAuthorizationUrl({
        redirectUri: 'https://arsipku.test/auth/callback',
        state: 'state-value',
        codeChallenge: 'challenge-value',
      }),
    );

    expect(url.pathname).toBe('/v2/sso/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('menormalisasi response token Auth v2 berbentuk camelCase', async () => {
    http.post.mockReturnValueOnce(
      of({
        data: {
          success: true,
          data: {
            accessToken: 'provider-access',
            refreshToken: 'provider-refresh',
            expiresIn: 3600,
            idToken: 'provider-id',
          },
        },
      }),
    );

    const result = await client.exchangeCode({
      code: 'code',
      redirectUri: 'https://arsipku.test/auth/callback',
      codeVerifier: 'v'.repeat(64),
    });

    expect(result).toMatchObject({
      accessToken: 'provider-access',
      refreshToken: 'provider-refresh',
      expiresIn: 3600,
    });
    const body = http.post.mock.calls[0][1] as string;
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('client_secret=server-secret');
    expect(body).toContain(`code_verifier=${'v'.repeat(64)}`);
  });

  it('refresh memakai endpoint JSON dan logout memakai Bearer', async () => {
    http.post
      .mockReturnValueOnce(
        of({
          data: {
            data: {
              accessToken: 'new-access',
              refreshToken: 'new-refresh',
              expiresIn: '1h',
            },
          },
        }),
      )
      .mockReturnValueOnce(of({ data: { success: true } }));

    await client.refreshToken('old-refresh');
    await client.logout('new-access');

    expect(http.post.mock.calls[0][0]).toBe(
      'https://auth.example.test/v2/auth/refresh',
    );
    expect(http.post.mock.calls[0][1]).toEqual({
      refreshToken: 'old-refresh',
    });
    expect(http.post.mock.calls[1][0]).toBe(
      'https://auth.example.test/v2/sso/logout/bearer',
    );
    expect(http.post.mock.calls[1][2].headers.Authorization).toBe(
      'Bearer new-access',
    );
  });
});
