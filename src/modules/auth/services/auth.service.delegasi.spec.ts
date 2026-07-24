import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { AuthService } from './auth.service';
import { PositionStatus } from '../../../common/enums/position-status.enum';

describe('AuthService.switchRole — delegation context in JWT', () => {
  let authService: AuthService;
  let jwtService: any;
  let orgDataService: any;

  const baseUser = {
    persnum: 1,
    nama: 'Siti',
    role: 'user' as const,
    activeRole: { id: 'u', name: 'USER' },
    activePermissions: [{ resource: 'naskah-dinas', actions: ['read'] }],
    company: '1',
    companyText: 'C',
    area: 'A',
    areaText: 'A',
    subArea: '1',
    subAreaText: 'SA',
    organization: '1',
    organizationText: 'O',
    position: '1',
    positionText: 'Staff',
    bodTag: '',
    abbreviation: '',
  };

  beforeEach(() => {
    jwtService = { signAsync: jest.fn(async () => 'jwt-mock') };
    orgDataService = {
      findByPersnum: jest.fn(async () => ({
        company: 1,
        companyText: 'C',
        area: 'A',
        areaText: 'A',
        subArea: 1,
        subAreaText: 'SA',
        organization: 1,
        organizationText: 'O',
        position: 1,
        positionText: 'Staff',
        bodTag: '',
        abbreviation: '',
        atasan_langsung: null,
      })),
    };
    authService = new AuthService(
      jwtService as JwtService,
      {} as any, // httpService
      {} as ConfigService, // configService
      {} as any, // sessionService
      orgDataService,
      {} as any, // userRoleRepo
      {} as any, // rbacService
    );
  });

  it('delegation switch: payload carries position_status + delegator_persnum', async () => {
    const delegasi = {
      as_position: '50000001',
      as_position_text: 'EVP of PMO',
      as_organization: '9',
      as_organization_text: 'PMO',
      as_area: 'A',
      as_area_text: 'A',
      as_sub_area: '1',
      as_sub_area_text: 'SA',
      company: '1',
      company_text: 'C',
      position_status: PositionStatus.PT,
      persnum: '777', // delegator's persnum (string in DB)
    } as any;

    await authService.switchRole(baseUser as any, delegasi);

    const payload = jwtService.signAsync.mock.calls[0][0];
    expect(payload.position_status).toBe(PositionStatus.PT);
    expect(payload.delegator_persnum).toBe(777);
    expect(payload.persnum).toBe(1); // delegate's own persnum preserved
    expect(payload.nama).toBe('Siti'); // delegate's own name preserved
  });

  it('reset to original: payload nulls position_status + delegator_persnum', async () => {
    await authService.switchRole(baseUser as any, null);

    const payload = jwtService.signAsync.mock.calls[0][0];
    expect(payload.position_status).toBeNull();
    expect(payload.delegator_persnum).toBeNull();
  });
});

describe('AuthService.refreshWithSession — delegation context preservation', () => {
  let authService: AuthService;
  let jwtService: any;
  let sessionService: any;
  let httpService: any;
  let configService: any;
  let orgDataService: any;
  let userRoleRepo: any;
  let rbacService: any;

  const futureIso = new Date(Date.now() + 3600_000).toISOString();

  const delegatedPayload = {
    persnum: 1,
    nama: 'Siti',
    role: 'user' as const,
    company: '9',
    companyText: 'PMO',
    area: 'A',
    areaText: 'A',
    subArea: '1',
    subAreaText: 'SA',
    organization: '9',
    organizationText: 'PMO',
    position: '50000001',
    positionText: 'EVP of PMO',
    bodTag: '',
    abbreviation: '',
    position_status: PositionStatus.PT,
    delegator_persnum: 777,
  };

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(() => ({ ...delegatedPayload })),
      signAsync: jest.fn(async () => 'new-jwt'),
    };
    sessionService = {
      deleteExpiredSessions: jest.fn(),
      findSession: jest.fn(async () => ({
        userPersnum: 1,
        airnavRefreshToken: 'refresh-token',
        airnavAccessToken: 'access-token',
        airnavExpiredAt: new Date(Date.now() + 3600_000),
      })),
      updateSession: jest.fn(),
    };
    httpService = {
      post: jest.fn(() =>
        of({
          data: {
            responStatus: 200,
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            expireToken: futureIso,
          },
        }),
      ),
      get: jest.fn(() => of({ data: { data: [] } })),
    };
    configService = { get: jest.fn(() => 'https://refresh') };
    orgDataService = {
      findByPersnum: jest.fn(async () => ({
        persnum: 1,
        nama: 'Siti',
        company: 1,
        companyText: 'C',
        area: 'A',
        areaText: 'A',
        subArea: 1,
        subAreaText: 'SA',
        organization: 1,
        organizationText: 'O',
        position: 1,
        positionText: 'Staff',
        bodTag: '',
        abbreviation: '',
        atasan_langsung: null,
      })),
    };
    userRoleRepo = { findOne: jest.fn(async () => null) };
    rbacService = {
      buildActiveRoleAndPermissions: jest.fn(async () => ({
        activeRole: { id: 'u', name: 'USER' },
        activePermissions: [{ resource: 'naskah-dinas', actions: ['read'] }],
        roles: [{ id: 'u', name: 'USER' }],
        role: 'user' as const,
      })),
    };

    authService = new AuthService(
      jwtService as JwtService,
      httpService,
      configService as ConfigService,
      sessionService,
      orgDataService,
      userRoleRepo,
      rbacService,
    );
  });

  it('preserves delegated position_status, delegator_persnum and org scope across refresh', async () => {
    await authService.refreshWithSession('session-id', 'old-token');

    const newPayload = jwtService.signAsync.mock.calls[0][0];
    expect(newPayload.position_status).toBe(PositionStatus.PT);
    expect(newPayload.delegator_persnum).toBe(777);
    expect(newPayload.persnum).toBe(1);
    expect(newPayload.nama).toBe('Siti');
    expect(newPayload.company).toBe('9');
    expect(newPayload.organization).toBe('9');
    expect(newPayload.position).toBe('50000001');
    expect(newPayload.role).toBe('user');
    expect(newPayload.activeRole).toEqual({ id: 'u', name: 'USER' });
  });
});
