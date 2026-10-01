import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { DEFAULT_BSRE_NIK } from '../../../common/constants/bsre.constants';
import { PositionStatus } from '../../../common/enums/position-status.enum';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'default-secret-key',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    console.log('[JwtStrategy] Validating payload:', {
      persnum: payload.persnum,
      role: payload.role,
      keys: Object.keys(payload),
    });

    if (!payload.persnum) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const sessionHeader = req.headers['x-session-id'];
    const sessionId = Array.isArray(sessionHeader)
      ? sessionHeader[0]
      : sessionHeader;

    return {
      ...payload,
      // Token lama belum selalu membawa status jabatan definitif. Normalisasi
      // di boundary autentikasi agar seluruh endpoint menerima kontrak YBS.
      position_status: payload.position_status ?? PositionStatus.YBS,
      ...(sessionId ? { sessionId } : {}),
      nik: DEFAULT_BSRE_NIK,
    };
  }
}
