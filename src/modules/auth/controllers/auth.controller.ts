import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
  Query,
  Res,
  UnauthorizedException,
  BadRequestException,
  Redirect,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { computeEffectivePersnum } from '../../../common/helpers/delegasi-rendering.helper';
import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import { DelegasiService } from '../../delegasi/services/delegasi.service';
import { RbacService } from '../../rbac/services/rbac.service';
import { PermissionCacheService } from '../../../common/guards/permission-cache.service';
import { VerifyTokenDto } from '../dto/verify-token.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LoginDto } from '../dto/login.dto';
import { SwitchProfileDto } from '../dto/switch-profile.dto';
import { OidcCodeExchangeDto } from '../dto/oidc-code-exchange.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    private readonly delegasiService: DelegasiService,
    private readonly rbacService: RbacService,
    private readonly permissionCache: PermissionCacheService,
    private readonly jwtService: JwtService,
    private readonly legalRoleService: LegalRoleService,
  ) {}

  /**
   * SSO Redirect - arahkan user ke AirNav SSO
   */
  @Public()
  @SkipTransform()
  @Get('sso-redirect')
  @ApiOperation({
    summary: 'SSO Redirect',
    description: 'Redirect user ke halaman login AirNav SSO',
  })
  ssoRedirect() {
    const baseUrl = this.configService.get<string>('AIRNAV_BASE_URL');
    const redirectUri = this.configService.get<string>('AIRNAV_CALLBACK_URL');

    // const encoded = Buffer.from(redirectUri, 'utf-8').toString('base64');
    const encoded = Buffer.from(redirectUri ?? '', 'utf-8').toString('base64');

    const finalUrl = `${baseUrl}/?redirect_uri=${encoded}`;

    return { url: finalUrl, statusCode: 302 };
  }

  @Public()
  @SkipTransform()
  @Get('sso-redirect-local')
  @ApiOperation({
    summary: 'SSO Redirect',
    description: 'Redirect user ke halaman login AirNav SSO',
  })
  ssoRedirectlocal() {
    const baseUrl = this.configService.get<string>('AIRNAV_BASE_URL');
    const redirectUri = this.configService.get<string>(
      'AIRNAV_CALLBACK_URL_LOCAL',
    );

    // const encoded = Buffer.from(redirectUri, 'utf-8').toString('base64');
    const encoded = Buffer.from(redirectUri ?? '', 'utf-8').toString('base64');

    const finalUrl = `${baseUrl}/?redirect_uri=${encoded}`;

    return { url: finalUrl, statusCode: 302 };
  }

  @Public()
  @Get('oidc/config')
  @ApiOperation({ summary: 'Konfigurasi publik client OIDC AirNav Auth' })
  getOidcConfig() {
    return this.authService.getOidcClientConfig();
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Post('oidc/exchange')
  @ApiOperation({
    summary: 'Tukar authorization code OIDC menjadi sesi ArsipKu',
  })
  async exchangeOidcCode(
    @Body() dto: OidcCodeExchangeDto,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.authService.loginWithOidcCode(
      dto.code,
      dto.codeVerifier,
      userAgent,
      ip,
    );
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Post('oidc/refresh')
  @ApiOperation({ summary: 'Refresh sesi OIDC ArsipKu dengan token rotation' })
  async refreshOidc(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const bearer = req.headers.authorization || '';
    const appToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!appToken) {
      throw new UnauthorizedException('Authorization token required');
    }
    const result = await this.authService.refreshOidcWithSession(
      dto.sessionId,
      appToken,
    );
    return {
      message: result.message,
      accessToken: result.accessToken,
      expiredToken: result.expiredToken,
      sessionId: result.sessionId,
      user: result.payloadRefresh,
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Post('oidc/logout')
  @ApiOperation({ summary: 'Revoke sesi AirNav Auth dan hapus sesi ArsipKu' })
  async logoutOidc(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const bearer = req.headers.authorization || '';
    const appToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!appToken) {
      throw new UnauthorizedException('Authorization token required');
    }
    return this.authService.logoutOidcSession(dto.sessionId, appToken);
  }

  /**
   * Get SSO URL - dapatkan URL login AirNav (untuk testing)
   */
  @Public()
  @Get('sso-url')
  @ApiOperation({
    summary: 'Get SSO Login URL',
    description: 'Dapatkan URL login AirNav tanpa redirect (untuk testing)',
  })
  getSsoUrl() {
    const redirectUri = this.configService.get('AIRNAV_CALLBACK_URL');
    const loginUrl = `https://auth.airnavindonesia.co.id/user/login?redirecturi=${encodeURIComponent(redirectUri)}`;

    return {
      message: 'Copy URL ini dan buka di browser',
      loginUrl,
      callbackUrl: redirectUri,
    };
  }

  /**
   * SSO Callback - handle redirect dari AirNav setelah login
   */
  @Public()
  @Get('autharsipku')
  @ApiOperation({
    summary: 'SSO Callback Endpoint',
    description:
      'Endpoint callback dari AirNav SSO setelah user berhasil login. Akan auto-verify token dan redirect ke frontend.',
  })
  async ssoCallback(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      if (!token) {
        // Redirect ke frontend dengan error
        const frontendUrl =
          this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
        return res.redirect(
          `${frontendUrl}/auth/error?message=Token tidak ditemukan`,
        );
      }

      const userAgent = req.headers['user-agent'];
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip;

      // Auto verify token dan create session
      const result = await this.authService.loginWithSsoToken(
        token,
        userAgent,
        ip,
      );

      // Redirect ke frontend dengan JWT token
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/auth/callback?accessToken=${result.accessToken}&sessionId=${result.sessionId}&expiredToken=${result.expiredToken}`;

      return res.redirect(redirectUrl);
    } catch (error) {
      // Redirect ke frontend dengan error
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
      const errorMessage = encodeURIComponent(error.message || 'Login gagal');
      return res.redirect(`${frontendUrl}/auth/error?message=${errorMessage}`);
    }
  }

  /**
   * Direct Login - login dengan username & password (untuk testing)
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Direct Login (Username & Password)',
    description:
      'Login langsung dengan username dan password AirNav. Endpoint ini akan call AirNav API untuk login dan auto-create session.',
  })
  async directLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<{
    message: string;
    accessToken: string;
    expiredToken: string;
    refreshToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const userAgent = req.headers['user-agent'];
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;

    return this.authService.loginWithCredentials(
      dto.username,
      dto.password,
      userAgent,
      ip,
    );
  }

  /**
   * Test Login - manual login dengan token dari AirNav
   UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @*/
  @Public()
  @Post('test-login')
  @ApiOperation({
    summary: 'Test Login (Manual SSO Token)',
    description:
      'Login menggunakan token AirNav yang didapat dari callback URL. Gunakan endpoint ini untuk testing manual.',
  })
  async testLogin(
    @Body() dto: VerifyTokenDto,
    @Req() req: Request,
  ): Promise<{
    message: string;
    accessToken: string;
    expiredToken: string;
    refreshToken: string;
    sessionId: string;
    user: JwtPayload;
  }> {
    const userAgent = req.headers['user-agent'];
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;

    return this.authService.loginWithSsoToken(dto.token, userAgent, ip);
  }

  /**
   * Verify Token - endpoint untuk callback dari AirNav
   UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @*/
  @Public()
  @Post('verify-token')
  @ApiOperation({
    summary: 'Verify SSO Token (Callback Endpoint)',
    description:
      'Endpoint callback untuk menerima token dari AirNav setelah user login di SSO. Akan membuat session dan generate JWT.',
  })
  async verifyToken(
    @Body() dto: VerifyTokenDto,
    @Req() req: Request,
  ): Promise<{
    message: string;
    accessToken: string;
    expiredToken: string;
    refreshToken: string;
    sessionId: string;
    user: JwtPayload & { abbreviation?: string };
  }> {
    const userAgent = req.headers['user-agent'];
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await this.authService.loginWithSsoToken(
      dto.token,
      userAgent,
      ip,
    );

    // Add abbreviation field (alias for bodTag)
    return result;
  }

  /**
   * Refresh Token - perpanjang session
   */
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh Token',
    description:
      'Perpanjang session dan generate JWT baru menggunakan session ID.',
  })
  async refreshToken(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const bearer = req.headers.authorization || '';
    const appToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;

    if (!appToken) {
      throw new UnauthorizedException('Authorization token required');
    }

    const result = await this.authService.refreshWithSession(
      dto.sessionId,
      appToken,
    );

    return {
      message: result.message,
      data: {
        accessToken: result.accessToken,
        expiredToken: result.expiredToken,
        sessionId: result.sessionId,
        user: result.payloadRefresh,
      },
    };
  }

  /**
   * Logout - hapus session
   */
  /**
   * Logout - hapus session dan redirect ke AirNav logout
   */
  @Get('logout')
  @Public()
  @Redirect()
  @ApiOperation({
    summary: 'Logout',
    description:
      'Logout user, hapus session, dan redirect ke AirNav SSO logout.',
  })
  async logout(@Query('sessionId') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    await this.sessionService.deleteSessionById(sessionId);

    const ssoLogoutBase = this.configService.get<string>('AIRNAV_LOGOUT_URL');
    const redirectUri = this.configService.get<string>('AIRNAV_CALLBACK_URL');

    const encoded = Buffer.from(redirectUri ?? '', 'utf-8').toString('base64');

    return {
      url: `${ssoLogoutBase}?redirect_uri=${encoded}`,
      statusCode: 302,
    };
  }

  /**
   * Logout V2 - hapus session tanpa redirect
   */
  @Get('logout-v2')
  @Public()
  @ApiOperation({
    summary: 'Logout aplikasi + hapus session + redirect logout SSO AirNav',
  })
  async logoutv2(@Query('sessionId') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    await this.sessionService.deleteSessionById(sessionId);
    return {
      message: 'Logout successfully',
    };
  }

  /**
   * Get Profile - ambil user info dari JWT + data alamat dari sub_area_alamat
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({
    summary: 'Get User Profile',
    description:
      'Ambil informasi user dari JWT token dan data alamat dari sub_area_alamat.',
  })
  async getProfile(@CurrentUser() user: JwtPayload): Promise<{
    message: string;
    user: JwtPayload & { abbreviation?: string };
    alamatInfo: {
      kantor: string;
      gedung: string;
      kota: string;
      alamat: string;
    } | null;
    isLegalRole?: boolean;
    delegations?: Array<{
      id: string;
      delegated_role: {
        position_status: string;
        position_status_label: string;
        description: string;
        persnum: string;
        name: string;
        position: string;
        position_text: string;
        organization: string;
        organization_text: string;
        area: string;
        area_text: string;
        sub_area: string;
        sub_area_text: string;
        company: string;
        company_text: string;
        bod_tag: string | null;
      };
      delegated_from: {
        persnum: string;
        name: string;
        position: string;
        position_text: string;
      };
      period: {
        start_date: Date;
        end_date: Date;
      };
    }>;
  }> {
    // Get alamat info from sub_area_alamat based on user context
    let alamatInfo: {
      kantor: string;
      gedung: string;
      kota: string;
      alamat: string;
    } | null = null;

    try {
      if (user.company && user.area && user.subArea) {
        const result = await this.subAreaAlamatService.findAlamatByUserContext(
          String(user.company),
          user.area,
          user.subArea,
          new Date(), // current date for active record
        );

        if (result) {
          alamatInfo = {
            kantor: result.kantor,
            gedung: result.gedung,
            kota: result.kota,
            alamat: result.alamat,
          };
        }
      }
    } catch (error) {
      console.error('[getProfile] Error fetching alamat info:', error);
      // Continue without alamat info
    }

    // Get active delegations for this user (where user is the recipient)
    let delegations: Array<{
      id: string;
      delegated_role: {
        position_status: string;
        position_status_label: string;
        description: string;
        persnum: string;
        name: string;
        position: string;
        position_text: string;
        organization: string;
        organization_text: string;
        area: string;
        area_text: string;
        sub_area: string;
        sub_area_text: string;
        company: string;
        company_text: string;
        bod_tag: string | null;
      };
      delegated_from: {
        persnum: string;
        name: string;
        position: string;
        position_text: string;
      };
      period: {
        start_date: Date;
        end_date: Date;
      };
    }> = [];
    try {
      if (user.persnum) {
        const result = await this.delegasiService.getAvailableRoles(
          String(user.persnum),
        );
        delegations = result.delegations;
      }
    } catch (error) {
      console.error('[getProfile] Error fetching delegations:', error);
      // Continue without delegations
    }

    // Cek apakah user adalah legal role (dari tabel legal_role)
    let isLegalRole = false;
    try {
      if (user.position) {
        const activeIds = await this.legalRoleService.getActivePositionIds();
        isLegalRole = activeIds.includes(String(user.position));
      }
    } catch (error) {
      console.error('[getProfile] Error checking legal role:', error);
    }

    return {
      message: 'Profile retrieved from JWT',
      user,
      alamatInfo,
      isLegalRole,
      delegations: delegations.length > 0 ? delegations : undefined,
    };
  }

  /**
   * GET /auth/refresh-permissions
   * Re-query permission live dari DB (bukan dari JWT) dan re-sign JWT baru.
   * Dipakai frontend setelah superadmin update RBAC agar perubahan efektif segera.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('refresh-permissions')
  @ApiOperation({
    summary: 'Refresh permissions',
    description:
      'Re-query permission live dari DB dan return JWT baru dengan permission terbaru.',
  })
  async refreshPermissions(@CurrentUser() user: JwtPayload) {
    if (!user.persnum) {
      throw new UnauthorizedException('User identity missing');
    }

    // Use effectivePersnum (delegator's when delegated) so the refreshed perms
    // match the delegation. Shared helper — same logic as the PermissionGuard.
    const effPersnum = computeEffectivePersnum(user);

    this.permissionCache.invalidate(effPersnum);

    const ctx =
      await this.rbacService.buildActiveRoleAndPermissions(effPersnum);

    const { exp, iat, ...base } = user as any;
    const newPayload: JwtPayload = {
      ...base,
      // activeRole/role/roles stay the delegate's own (D4 — bypass not inherited).
      // activePermissions = effective (delegator's when delegated) so the FE Tulis
      // menu shows the delegator's naskah types.
      activePermissions: ctx.activePermissions,
    };

    const expiresIn =
      exp && typeof exp === 'number'
        ? Math.max(Math.floor((exp * 1000 - Date.now()) / 1000), 3600)
        : 86400;

    const accessToken = await this.jwtService.signAsync(newPayload, {
      expiresIn,
    });

    return {
      success: true,
      message: 'Permissions refreshed',
      data: {
        accessToken,
        activeRole: newPayload.activeRole,
        activePermissions: newPayload.activePermissions,
        role: newPayload.role,
      },
    };
  }

  /**
   * POST /auth/switch-profile
   * Ganti profile aktif user antara 'akun_asli' dan 'sekretaris' (delegasi sekretaris).
   * Hanya valid jika user punya assignment aktif `sekretaris_delegasi` di organization_tu.
   * Re-sign JWT baru dengan active_profile terbaru (tanpa logout-login ulang).
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('switch-profile')
  @ApiOperation({
    summary: 'Switch active profile',
    description:
      'Ganti profile aktif user antara akun asli dan sekretaris (delegasi sekretaris).',
  })
  async switchProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchProfileDto,
  ) {
    if (!user.persnum) {
      throw new UnauthorizedException('User identity missing');
    }

    // Hanya boleh switch ke 'sekretaris' jika user memang punya delegasi sekretaris aktif.
    const tuRoles = await this.authService.getTuRolesForPersnum(user.persnum);
    const hasSecretary = tuRoles.includes('sekretaris');
    if (dto.profile === 'sekretaris' && !hasSecretary) {
      throw new BadRequestException(
        'Anda tidak memiliki delegasi sekretaris untuk profile ini',
      );
    }

    const { exp, iat, ...base } = user as any;
    const newPayload: JwtPayload = {
      ...base,
      has_secretary_delegation: hasSecretary,
      available_profiles: hasSecretary
        ? ['akun_asli', 'sekretaris']
        : ['akun_asli'],
      active_profile: dto.profile,
    };

    const expiresIn =
      exp && typeof exp === 'number'
        ? Math.max(Math.floor((exp * 1000 - Date.now()) / 1000), 3600)
        : 86400;

    const accessToken = await this.jwtService.signAsync(newPayload, {
      expiresIn,
    });

    return {
      success: true,
      message:
        dto.profile === 'sekretaris'
          ? 'Profile dialihkan ke Sekretaris'
          : 'Profile dialihkan ke Akun Asli',
      data: {
        accessToken,
        active_profile: newPayload.active_profile,
        has_secretary_delegation: newPayload.has_secretary_delegation,
        available_profiles: newPayload.available_profiles,
      },
    };
  }
}
