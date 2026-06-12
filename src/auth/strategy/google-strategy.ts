/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ['email', 'profile'],
    } as StrategyOptions); // ✅ cast to StrategyOptions
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(accessToken: string, refreshToken: string, profile: any) {
  // eslint-disable-next-line prettier/prettier
  const email = profile.emails?.[0]?.value;
  const name = profile.name
    ? `${profile.name.givenName ?? ""} ${profile.name.familyName ?? ""}`.trim()
    : profile.displayName ?? "Unknown User";

  return { email, name };
}

}
