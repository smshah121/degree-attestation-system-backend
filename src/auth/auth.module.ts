/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from 'src/user/user.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { LocalStrategy } from 'src/auth/strategy/local-guard';
import { JwtStrategy } from 'src/auth/strategy/jwt-guard';
import { GoogleStrategy } from './strategy/google-strategy';

@Module({
  imports: [UserModule, PassportModule,
    JwtModule.register({
      secret: "smshah",
      signOptions: {expiresIn: "1h"}
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy,JwtStrategy, GoogleStrategy],
})
export class AuthModule {}
