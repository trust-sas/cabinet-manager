import { BadRequestException, ConflictException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as nodemailer from 'nodemailer';
import { RoleLibelle } from '../users/entities/role-acces.entity';
import { SafeUserProfile, UsersService } from '../users/users.service';
import { PaireDeJetons, TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';

export interface PreAuthResponse {
  requiresTwoFactor: true;
  preAuthToken: string;
}

export type LoginResponse = PaireDeJetons | PreAuthResponse;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  // ── Connexion ─────────────────────────────────────────────────────────────

  // ── Connexion par Téléphone (ou identifiant) ─────────────────────────────

  async login(
    identifiant: string,
    motDePasse: string,
    appareilId: string,
  ): Promise<LoginResponse> {
    const utilisateur = await this.usersService.findByIdentifiant(identifiant);

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Numéro de téléphone ou mot de passe incorrect.', status: 401 },
      });
    }

    const motDePasseValide = utilisateur.motDePasseHash
      ? await argon2.verify(utilisateur.motDePasseHash, motDePasse)
      : false;
    if (!motDePasseValide) {
      await this.usersService.enregistrerEchecConnexion(utilisateur.id);
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Numéro de téléphone ou mot de passe incorrect.', status: 401 },
      });
    }

    await this.usersService.reinitialiserEchecs(utilisateur.id);
    const permissions = utilisateur.roleAcces?.permissions ?? [];

    if (utilisateur.authentif2faActif) {
      const preAuthToken = await this.twoFactorService.genererPreAuthToken(utilisateur.id, appareilId);
      return { requiresTwoFactor: true, preAuthToken };
    }

    return this.tokenService.emettrePaireDeJetons(utilisateur, permissions, appareilId);
  }

  // ── Inscription publique par Téléphone (Email optionnel) ─────────────────
  async register(params: {
    nom: string;
    prenom?: string;
    telephone: string;
    email?: string;
    dateNaissance?: string;
    motDePasse: string;
    role?: RoleLibelle;
  }): Promise<{ message: string; user: SafeUserProfile }> {
    const { nom, prenom, telephone, email, dateNaissance, motDePasse } = params;
    const role = params.role || RoleLibelle.AVOCAT;

    const user = await this.usersService.createUser({
      nom: prenom ? `${nom} ${prenom}` : nom,
      telephone,
      email,
      motDePasse,
      role,
      prenom,
      dateNaissance,
    });

    return {
      message: 'Votre compte Avocat a été créé avec succès. Vous pouvez maintenant vous connecter.',
      user,
    };
  }

  // ── Refresh token ─────────────────────────────────────────────────────────

  async refresh(refreshToken: string, appareilId: string): Promise<PaireDeJetons> {
    const utilisateurId = await this.tokenService.trouverUtilisateurIdParToken(refreshToken);
    if (!utilisateurId) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Jeton invalide.', status: 401 },
      });
    }
    const utilisateur = await this.usersService.findById(utilisateurId);
    const permissions = utilisateur.roleAcces?.permissions ?? [];
    return this.tokenService.rafraichir(refreshToken, utilisateur, permissions, appareilId);
  }

  // ── Déconnexion ───────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revoquerToken(refreshToken);
  }

  // ── Profil courant ────────────────────────────────────────────────────────

  async getMe(utilisateurId: number) {
    return this.usersService.toSafeProfile(await this.usersService.findById(utilisateurId));
  }

  /**
   * Connexion / Inscription sociale (Google / Apple)
   */
  async loginWithSocial(params: {
    email?: string;
    idToken?: string;
    identityToken?: string;
    provider: 'google' | 'apple';
    nom?: string;
    appareilId?: string;
  }): Promise<LoginResponse> {
    const { provider, nom, appareilId = 'social' } = params;
    let cleanEmail = params.email ? params.email.trim().toLowerCase() : '';

    if (!cleanEmail && (params.idToken || params.identityToken)) {
      try {
        const token = (params.idToken || params.identityToken)!;
        const parts = token.split('.');
        if (parts.length >= 2) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (decoded && decoded.email) {
            cleanEmail = decoded.email.trim().toLowerCase();
          }
        }
      } catch (e) {
        console.warn('Erreur décodage token social:', e);
      }
    }

    if (!cleanEmail) {
      throw new BadRequestException({
        error: { code: 'INVALID_SOCIAL_PAYLOAD', message: 'Adresse email ou jeton OAuth invalide.', status: 400 },
      });
    }

    let utilisateur = await this.usersService.findByEmail(cleanEmail);

    if (!utilisateur) {
      const defaultNom = nom || (provider === 'google' ? 'Avocat Google' : 'Avocat Apple');
      await this.usersService.createUser({
        nom: defaultNom,
        telephone: `+23760000${Math.floor(1000 + Math.random() * 9000)}`,
        email: cleanEmail,
        motDePasse: `Social_${provider}_${Date.now()}`,
        role: RoleLibelle.AVOCAT,
      });
      utilisateur = await this.usersService.findByEmail(cleanEmail);
    }

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException({
        error: { code: 'ACCOUNT_DISABLED', message: 'Ce compte a été désactivé.', status: 401 },
      });
    }

    const permissions = utilisateur.roleAcces?.permissions ?? [];
    return this.tokenService.emettrePaireDeJetons(utilisateur, permissions, appareilId);
  }

  // ── OTP SMS VERIFICATION via Brevo Transactional SMS ──────────────────────
  // Clé d'API SMS : WShYfsQGojPTsQ4SRlnJ6g8LXoRNkSMa

  private readonly logger = new Logger('AuthService');
  private otpStore: Map<string, { code: string; expiresAt: number; attempts: number }> = new Map();
  /** Helper de normalisation du numéro de téléphone avec préfixe +237 */
  private normalizePhone(phone: string): string {
    let clean = (phone || '').trim().replace(/\s+/g, '');
    if (!clean) return '';
    if (!clean.startsWith('+')) {
      clean = `+237${clean.replace(/^0/, '')}`;
    }
    return clean;
  }

  /**
   * Envoi de code OTP par WhatsApp via Whapi.cloud API (Clé Whapi: WShYfsQGojPTsQ4SRlnJ6g8LXoRNkSMa)
   * IMPORTANT : Vérifie l'unicité du numéro AVANT d'envoyer le code OTP.
   */
  async sendOtp(target: string): Promise<{ success: boolean; message: string; code?: string }> {
    const rawTarget = target.trim().replace(/\s+/g, '');
    if (!rawTarget) {
      throw new BadRequestException({ error: { code: 'INVALID_TARGET', message: 'Numéro de téléphone requis.', status: 400 } });
    }

    const phone = this.normalizePhone(rawTarget);

    // ── Vérification unicité AVANT envoi du code ───────────────────────────
    const existingUser = await this.usersService.findByTelephone(phone);
    if (existingUser) {
      throw new ConflictException({
        error: {
          code: 'PHONE_ALREADY_REGISTERED',
          message: 'Ce numéro de téléphone est déjà associé à un compte. Veuillez vous connecter.',
          status: 409,
        },
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Stocker le code sous le numéro normalisé ET sous la version brute pour tolérance totale
    this.otpStore.set(phone, { code, expiresAt, attempts: 0 });
    this.otpStore.set(rawTarget, { code, expiresAt, attempts: 0 });

    this.logger.log(`📱 [Whapi OTP] Code ${code} généré pour ${phone} (brut: ${rawTarget})`);

    // Clé API Whapi.cloud et URL transmises par la configuration
    const whapiBaseUrl = process.env.WHAPI_URL || 'https://gate.whapi.cloud';
    const whapiToken = process.env.WHAPI_TOKEN || 'WShYfsQGojPTsQ4SRlnJ6g8LXoRNkSMa';
    const whapiPhone = phone.replace(/^\+/, '');

    try {
      const response = await fetch(`${whapiBaseUrl}/messages/text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whapiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: whapiPhone,
          body: `🏛️ Cabinet Manager — Votre code de vérification à 6 chiffres est : ${code}`,
        }),
      });

      if (response.ok) {
        this.logger.log(`✅ [Whapi OTP] Message WhatsApp envoyé avec succès au ${whapiPhone}`);
      } else {
        const errData = await response.json().catch(() => ({}));
        this.logger.warn(`⚠️ [Whapi OTP] Réponse API Whapi (${response.status}): ${JSON.stringify(errData)}`);
      }
    } catch (whapiError: any) {
      this.logger.warn(`⚠️ [Whapi OTP] Exception API Whapi: ${whapiError?.message}`);
    }

    return {
      success: true,
      message: `Code de vérification transmis au ${phone}.`,
      code,
    };
  }

  /**
   * Vérifie le code OTP. Utilisé lors de l'inscription AVANT la création du compte.
   * Accepte également le code de secours MASTER_OTP_CODE s'il est configuré.
   */
  async verifyOtp(target: string, code: string, _appareilId: string = 'otp-verify'): Promise<{ verified: true; target: string }> {
    const rawTarget = target.trim().replace(/\s+/g, '');
    const phone = this.normalizePhone(rawTarget);
    const inputCode = code.trim();

    // ── Vérification du code de secours MASTER_OTP_CODE ───────────────────
    const masterOtp = process.env.MASTER_OTP_CODE;
    if (masterOtp && inputCode === masterOtp.trim()) {
      this.logger.log(`🔑 [Master OTP] Code de secours validé pour ${phone}`);
      this.otpStore.delete(phone);
      this.otpStore.delete(rawTarget);
      return { verified: true, target: phone };
    }

    let record = this.otpStore.get(phone) || this.otpStore.get(rawTarget) || this.otpStore.get(target.trim().toLowerCase());

    if (!record) {
      throw new BadRequestException({ error: { code: 'OTP_EXPIRED', message: 'Aucun code trouvé. Veuillez demander un nouveau code.', status: 400 } });
    }

    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(phone);
      this.otpStore.delete(rawTarget);
      throw new BadRequestException({ error: { code: 'OTP_EXPIRED', message: 'Le code a expiré (10 minutes). Veuillez en demander un nouveau.', status: 400 } });
    }

    if (record.attempts >= 5) {
      this.otpStore.delete(phone);
      this.otpStore.delete(rawTarget);
      throw new BadRequestException({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Demandez un nouveau code.', status: 400 } });
    }

    if (record.code !== inputCode) {
      record.attempts += 1;
      throw new BadRequestException({ error: { code: 'INVALID_OTP', message: `Code incorrect (tentative ${record.attempts}/5).`, status: 400 } });
    }

    // Code valide — le supprimer du store
    this.otpStore.delete(phone);
    this.otpStore.delete(rawTarget);

    return { verified: true, target: phone };
  }

  // ── Token Expo Push ───────────────────────────────────────────────────────

  async enregistrerExpoPushToken(utilisateurId: number, expoPushToken: string): Promise<void> {
    await this.usersService.sauvegarderExpoPushToken(utilisateurId, expoPushToken);
  }
}
