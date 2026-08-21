import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Connexion par téléphone (ou identifiant) ──────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { telephone?: string; identifiant?: string; email?: string; motDePasse?: string; password?: string },
    @Req() req: Request,
  ) {
    const appareilId = (req.headers['x-device-id'] as string) ?? 'unknown';
    const identifiant = body.telephone || body.identifiant || body.email || '';
    const pass = body.motDePasse || body.password || '';
    return this.authService.login(identifiant, pass, appareilId);
  }

  // ── Inscription publique (Avocat) par téléphone ──────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register({
      nom: dto.nom,
      prenom: dto.prenom,
      telephone: dto.telephone,
      email: dto.email,
      dateNaissance: dto.dateNaissance,
      motDePasse: dto.motDePasse,
      role: dto.role,
    });
  }

  // ── Connexion Sociale Google / Apple ──────────────────────────────────────

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() body: { email?: string; nom?: string; idToken?: string }, @Req() req: Request) {
    const appareilId = (req.headers['x-device-id'] as string) ?? 'google-auth';
    return this.authService.loginWithSocial({ email: body.email, idToken: body.idToken, provider: 'google', nom: body.nom, appareilId });
  }

  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async appleLogin(@Body() body: { email?: string; nom?: string; identityToken?: string }, @Req() req: Request) {
    const appareilId = (req.headers['x-device-id'] as string) ?? 'apple-auth';
    return this.authService.loginWithSocial({ email: body.email, identityToken: body.identityToken, provider: 'apple', nom: body.nom, appareilId });
  }

  // ── Authentification / SMS OTP (Code à 6 chiffres via SMS) ───────────────

  @Public()
  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  async sendCode(@Body() body: { telephone?: string; email?: string; target?: string }) {
    const target = body.telephone || body.target || body.email || '';
    return this.authService.sendOtp(target);
  }

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() body: { telephone?: string; email?: string; target?: string }) {
    const target = body.telephone || body.target || body.email || '';
    return this.authService.sendOtp(target);
  }

  @Public()
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() body: { telephone?: string; email?: string; target?: string; code: string }, @Req() req: Request) {
    const appareilId = (req.headers['x-device-id'] as string) ?? 'otp-auth';
    const target = body.telephone || body.target || body.email || '';
    return this.authService.verifyOtp(target, body.code, appareilId);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: { telephone?: string; email?: string; target?: string; code: string }, @Req() req: Request) {
    const appareilId = (req.headers['x-device-id'] as string) ?? 'otp-auth';
    const target = body.telephone || body.target || body.email || '';
    return this.authService.verifyOtp(target, body.code, appareilId);
  }

  // ── Refresh token ─────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: { refreshToken: string },
    @Req() req: Request,
  ) {
    const appareilId = (req.headers['x-device-id'] as string) ?? 'unknown';
    return this.authService.refresh(body.refreshToken, appareilId);
  }

  // ── Déconnexion ───────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken);
  }

  // ── Profil courant ────────────────────────────────────────────────────────

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  // ── Enregistrement du token Expo Push ───────────────────────────

  @Post('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async enregistrerPushToken(
    @Body() body: { expoPushToken: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authService.enregistrerExpoPushToken(user.id, body.expoPushToken);
  }
}
