/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Req, Request, Res, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LocalAuthGuard } from "./guards/local-guard";
import { CreateUserDto } from "src/user/dto/create-user.dto";
import { JwtAuthGuard } from "./guards/jwt-guard";
import { AuthGuard } from "@nestjs/passport";
import { Response } from 'express';
import { Public } from "src/common/decorators/public-decorator";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService){}
  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req){
    return this.authService.login(req.user)
  }
  @UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@Req() req) {
 return this.authService.getProfile(req.user.sub)
}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google OAuth2 login
  }

  // Google callback
  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    const tokenData = await this.authService.googleLogin(req.user);
    
    // 🎯 THE FIX: Fetch or decode user details out of tokenData to deliver role and id
    const token = tokenData.access_token;
    const role = req.user.role || 'STUDENT'; // Safe assignment mapping
    const id = req.user.id;
    
    return res.redirect(`http://localhost:5173/oauth-success?token=${token}&role=${role}&id=${id}`);
  }

  @Post("register")
  async register(@Body() createUserDto: CreateUserDto){
    return this.authService.register(createUserDto)

  }
}