import { AuthService } from './auth.service';

describe('AuthService Auth v2 server-side flow', () => {
  const oidcSession = {
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const provider = {
    getAuthorizationUrl: jest.fn(() => 'https://auth.test/authorize'),
    exchangeCode: jest.fn(),
    getUserInfo: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  };
  const session = {
    createSession: jest.fn().mockResolvedValue({ id: 'app-session-id' }),
    findSession: jest.fn(),
    rotateOidcTokens: jest.fn(),
    deleteSessionById: jest.fn(),
  };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('arsipku-jwt'),
    verify: jest.fn(),
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
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      jwt as any,
      {} as any,
      {
        get: jest.fn(
          (key: string, fallback?: string) =>
            ({
              AUTH_REDIRECT_URI: 'https://arsipku.test/autharsipku',
              AUTH_SESSION_TTL_SECONDS: '28800',
            })[key] ?? fallback,
        ),
      } as any,
      session as any,
      { findByPersnum: jest.fn().mockResolvedValue(orgData) } as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {
        buildActiveRoleAndPermissions: jest.fn().mockResolvedValue({
          activeRole: { id: 'role-user', name: 'USER' },
          activePermissions: [],
          roles: [{ id: 'role-user', name: 'USER' }],
          role: 'user',
        }),
      } as any,
      { getActiveRolesForPersnum: jest.fn().mockResolvedValue([]) } as any,
      provider as any,
      oidcSession as any,
    );
  });

  it('menyimpan PKCE verifier/state di server ketika login dimulai', async () => {
    const result = await service.beginOidcLogin(
      '/beranda',
      'http://localhost:3000',
    );

    expect(result.url).toBe('https://auth.test/authorize');
    expect(oidcSession.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        state: expect.any(String),
        codeVerifier: expect.any(String),
        returnTo: '/beranda',
        frontendOrigin: 'http://localhost:3000',
      }),
    );
    expect(provider.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://arsipku.test/autharsipku',
        codeChallenge: expect.any(String),
      }),
    );
  });

  it('callback hanya mengembalikan id sesi, bukan token provider', async () => {
    oidcSession.get.mockResolvedValueOnce({
      state: 'valid-state',
      codeVerifier: 'v'.repeat(64),
      returnTo: '/beranda',
      frontendOrigin: 'http://localhost:3000',
      createdAt: Date.now(),
    });
    provider.exchangeCode.mockResolvedValueOnce({
      accessToken: 'provider-access',
      refreshToken: 'provider-refresh',
      idToken: 'provider-id',
      expiresIn: 3600,
    });
    provider.getUserInfo.mockResolvedValueOnce({ employee_no: '12345' });

    const result = await service.completeOidcLogin(
      'pending-id',
      'authorization-code',
      'valid-state',
    );

    expect(result).toEqual({
      sessionId: 'app-session-id',
      returnTo: '/beranda',
      frontendOrigin: 'http://localhost:3000',
    });
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(session.createSession).toHaveBeenCalledWith(
      12345,
      expect.objectContaining({
        airnavAccessToken: 'provider-access',
        airnavRefreshToken: 'provider-refresh',
      }),
    );
  });
});
