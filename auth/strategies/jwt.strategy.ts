import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppJwtPayload } from '../interface/app-jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AppJwtPayload) {
    // apapun yang direturn di sini akan jadi req.user
    return {
      id: payload.id,
      persnum: payload.persnum,
      name: payload.name,
      roleId: payload.channelId,
      role: payload.role,
      channelId: payload.channelId,
      channel: payload.role,

      company: payload.company,
      companyText: payload.companyText,
      area: payload.area,
      areaText: payload.areaText,
      subArea: payload.subArea,
      subAreaText: payload.subAreaText,
      position: payload.position,
      positionText: payload.positionText,
    };
  }
}
