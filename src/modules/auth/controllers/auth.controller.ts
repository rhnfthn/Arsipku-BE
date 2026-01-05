import { Controller, Post, Body, Get, Req, UseGuards, Query, Res, UnauthorizedException, BadRequestException, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { VerifyTokenDto } from '../dto/verify-token.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LoginDto } from '../dto/login.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
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
    const redirectUri = this.configService.get<string>('AIRNAV_CALLBACK_URL_LOCAL');

    // const encoded = Buffer.from(redirectUri, 'utf-8').toString('base64');
    const encoded = Buffer.from(redirectUri ?? '', 'utf-8').toString('base64');


    const finalUrl = `${baseUrl}/?redirect_uri=${encoded}`;

    return { url: finalUrl, statusCode: 302 };
   
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
    description: 'Endpoint callback dari AirNav SSO setelah user berhasil login. Akan auto-verify token dan redirect ke frontend.',
  })
  async ssoCallback(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      if (!token) {
        // Redirect ke frontend dengan error
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
        return res.redirect(`${frontendUrl}/auth/error?message=Token tidak ditemukan`);
      }

      const userAgent = req.headers['user-agent'];
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip;

      // Auto verify token dan create session
      const result = await this.authService.loginWithSsoToken(token, userAgent, ip);

      // Redirect ke frontend dengan JWT token
      const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/auth/callback?accessToken=${result.accessToken}&sessionId=${result.sessionId}&expiredToken=${result.expiredToken}`;
      
      return res.redirect(redirectUrl);
    } catch (error) {
      // Redirect ke frontend dengan error
      const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
      const errorMessage = encodeURIComponent(error.message || 'Login gagal');
      return res.redirect(`${frontendUrl}/auth/error?message=${errorMessage}`);
    }
  }

  /**
   * Direct Login - login dengan username & password (untuk testing)
   */
  @Public()
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

    return this.authService.loginWithCredentials(dto.username, dto.password, userAgent, ip);
  }

  /**
   * Test Login - manual login dengan token dari AirNav
   */
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
   */
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

    const result = await this.authService.loginWithSsoToken(dto.token, userAgent, ip);
    
    // Add abbreviation field (alias for bodTag)
    return result;
  }

  /**
   * Refresh Token - perpanjang session
   */
  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh Token',
    description:
      'Perpanjang session dan generate JWT baru menggunakan session ID.',
  })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    const bearer = req.headers.authorization || '';
    const appToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;

    if (!appToken) {
      throw new UnauthorizedException('Authorization token required');
    }

    const result = await this.authService.refreshWithSession(dto.sessionId, appToken);

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
   * Get Profile - ambil user info dari JWT
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({
    summary: 'Get User Profile',
    description: 'Ambil informasi user dari JWT token (no database call).',
  })
  getProfile(@CurrentUser() user: JwtPayload): {
    message: string;
    user: JwtPayload & { abbreviation?: string };
  } {
    return {
      message: 'Profile retrieved from JWT',
      user,
    };
  }
}
