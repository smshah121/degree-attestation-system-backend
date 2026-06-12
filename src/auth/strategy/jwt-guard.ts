/* eslint-disable prettier/prettier */
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'smshah',
    });
  }

  async validate(payload: any) {
    const user = await this.authService.validateUserbyId(payload.sub);
    if (!user) throw new UnauthorizedException();

    return {
      ...user,
      sub: payload.sub,
    };
  }
}
