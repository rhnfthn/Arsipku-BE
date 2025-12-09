import {
  Controller,
  Post,
  Body,
  Get,
  Redirect,
  Req,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { VerifyTokenDto } from '../dto/verify-token.dto';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { SessionService } from '../services/session.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('sso-redirect')
  @Public()
  @ApiOperation({
    summary: 'Redirect ke halaman SSO AirNav dengan redirect_uri encoded',
  })
  @Redirect()
  loginRedirect() {
    const baseUrl = this.configService.get<string>('SSO_BASE_URL');
    const redirectUri = this.configService.get<string>('SSO_REDIRECT_URI');

    const encoded = Buffer.from(redirectUri, 'utf-8').toString('base64');

    const finalUrl = `${baseUrl}/?redirect_uri=${encoded}`;

    return { url: finalUrl, statusCode: 302 };
  }

  @Post('verify-token')
  @Public()
  @ApiOperation({
    summary: 'Login via SSO AirNav dan buat JWT aplikasi',
  })
  async verifyToken(@Body() dto: VerifyTokenDto, @Req() req) {
    const result = await this.authService.loginWithSsoToken(
      dto.token,
      req.headers['user-agent'],
      req.ip,
    );

    return {
      message: result.message,
      data: {
        accessToken: result.accessToken,
        expiredToken: result.expiredToken,
        sessionId: result.sessionId,
        user: result.payload,
      },
    };
  }

  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh JWT aplikasi berdasarkan session SSO AirNav',
  })
  async refreshToken(@Body() dto: RefreshTokenDto, @Req() req) {
    const bearer = req.headers.authorization || '';
    const appToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;

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

  @Get('me')
  @ApiOperation({
    summary: 'Mendapatkan profil user yang sedang login',
  })
  async getProfile(@CurrentUser() currentUser) {
    // const user = await this.authService.getUserProfileByPersnum(currentUser.persnum);
    const user = currentUser;

    return {
      message: 'Success retrieved current user',
      data: user,
    };
  }

  @Get('logout')
  @ApiOperation({
    summary: 'Logout aplikasi + hapus session + redirect logout SSO AirNav',
  })
  @Redirect()
  async logout(@Query('sessionId') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    await this.sessionService.deleteSessionById(sessionId);

    const ssoLogoutBase = this.configService.get<string>('SSO_LOGOUT_URL');

    const redirectUri = this.configService.get<string>('SSO_REDIRECT_URI');

    const encoded = Buffer.from(redirectUri, 'utf-8').toString('base64');

    return {
      url: `${ssoLogoutBase}?redirect_uri=${encoded}`,
      statusCode: 302,
    };
  }

  // Debug Data User
  // @Get('test')
  // async test(@Req() req) {
  //   return req.user;
  // }
}
