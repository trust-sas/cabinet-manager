/**
 * modules/auth/token.service.ts
 * ---------------------------------------------------------------------------
 * Responsable de l'émission et de la validation des DEUX types de jetons :
 *
 *   - Access token (JWT signé, 15 min) : contient le payload RBAC complet
 *     (rôle + permissions) pour que chaque requête API n'ait pas besoin de
 *     recharger l'utilisateur depuis la base à chaque fois.
 *   - Refresh token (chaîne aléatoire opaque, 30 jours) : jamais un JWT
 *     lisible côté client, seulement une empreinte SHA-256 stockée en base
 *     (table refresh_tokens) permettant la révocation individuelle.
 *
 * ROTATION & DÉTECTION DE VOL (le point le plus subtil de ce fichier) :
 * à chaque appel à /auth/refresh, l'ancien refresh_token est marqué "used"
 * et un NOUVEAU est émis (rotation). Si un refresh_token déjà marqué "used"
 * est présenté à nouveau, cela signifie qu'une copie du jeton a été volée et
 * qu'un tiers (ou l'utilisateur légitime) l'a déjà utilisé une seconde fois :
 * on révoque alors IMMÉDIATEMENT tous les jetons actifs de cet utilisateur
 * sur cet appareil, par précaution.
 *
 * DÉBOGAGE : si un utilisateur se plaint d'être déconnecté en boucle, c'est
 * très probablement le mécanisme de détection de réutilisation qui se
 * déclenche à tort — vérifier que le CLIENT (web/mobile) ne rejoue jamais un
 * refresh_token déjà consommé (bug classique : deux appels /refresh en
 * parallèle depuis le même appareil).
 * ---------------------------------------------------------------------------
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RefreshToken } from './entities/refresh-token.entity';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { AccessTokenPayload } from '../../common/interfaces/jwt-payload.interface';

const ACCESS_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_JOURS = 30;

export interface PaireDeJetons {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // secondes, pour information côté client
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  /** Signe un access token JWT à partir du payload RBAC de l'utilisateur. */
  genererAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
  }

  /**
   * Génère un nouveau refresh token opaque, l'enregistre en base (hashé) et
   * retourne la valeur EN CLAIR (uniquement à cet instant : elle ne sera plus
   * jamais récupérable ensuite, seule son empreinte est conservée).
   */
  private async genererEtPersisterRefreshToken(
    utilisateur: Utilisateur,
    appareilId: string,
  ): Promise<string> {
    const valeurEnClair = `${uuidv4()}.${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = this.hacherToken(valeurEnClair);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_JOURS);

    const entity = this.refreshTokenRepository.create({
      utilisateurId: utilisateur.id,
      appareilId,
      tokenHash,
      expiresAt,
      used: false,
      createdAt: new Date(),
    });
    await this.refreshTokenRepository.save(entity);

    return valeurEnClair;
  }

  /** Émet la paire complète (access + refresh) après une connexion réussie. */
  async emettrePaireDeJetons(
    utilisateur: Utilisateur,
    permissions: string[],
    appareilId: string,
  ): Promise<PaireDeJetons> {
    const payload: AccessTokenPayload = {
      sub: utilisateur.id,
      cabinetId: utilisateur.cabinetId,
      role: utilisateur.role,
      permissions,
      twoFactorVerified: !utilisateur.authentif2faActif, // true si le 2FA n'est pas requis
      email: utilisateur.email ?? undefined,
    };

    const accessToken = this.genererAccessToken(payload);
    const refreshToken = await this.genererEtPersisterRefreshToken(utilisateur, appareilId);

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  /**
   * Valide un refresh token présenté par le client, applique la rotation et
   * retourne la nouvelle paire de jetons. Lève UnauthorizedException si le
   * jeton est invalide, expiré, révoqué, ou déjà utilisé (vol détecté).
   */
  async rafraichir(
    refreshTokenEnClair: string,
    utilisateur: Utilisateur,
    permissions: string[],
    appareilId: string,
  ): Promise<PaireDeJetons> {
    const tokenHash = this.hacherToken(refreshTokenEnClair);

    const enregistrement = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!enregistrement) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Jeton de rafraîchissement invalide.', status: 401 },
      });
    }

    if (enregistrement.revokedAt) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Jeton de rafraîchissement révoqué.', status: 401 },
      });
    }

    if (enregistrement.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Jeton de rafraîchissement expiré.', status: 401 },
      });
    }

    if (enregistrement.used) {
      // Réutilisation d'un jeton déjà consommé = signe probable de vol.
      // Mesure de précaution : on révoque tous les jetons actifs de cet
      // utilisateur pour cet appareil, forçant une reconnexion complète.
      await this.revoquerTousLesJetons(enregistrement.utilisateurId, enregistrement.appareilId);
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Jeton de rafraîchissement déjà utilisé. Toutes les sessions de cet appareil ont été révoquées par précaution.',
          status: 401,
        },
      });
    }

    // Rotation : on marque l'ancien jeton comme consommé...
    enregistrement.used = true;
    await this.refreshTokenRepository.save(enregistrement);

    // ...puis on émet une toute nouvelle paire.
    return this.emettrePaireDeJetons(utilisateur, permissions, appareilId);
  }

  /**
   * Identifie l'utilisateur propriétaire d'un refresh token SANS le valider
   * ni le modifier (pas de vérification d'expiration/révocation ici). Utilisé
   * par AuthService.refresh() pour savoir QUEL utilisateur charger avant
   * d'appeler rafraichir() (qui, lui, effectue la validation complète et la
   * rotation). Retourne `null` si le jeton est totalement inconnu.
   */
  async trouverUtilisateurIdParToken(refreshTokenEnClair: string): Promise<number | null> {
    const tokenHash = this.hacherToken(refreshTokenEnClair);
    const enregistrement = await this.refreshTokenRepository.findOne({ where: { tokenHash } });
    return enregistrement ? enregistrement.utilisateurId : null;
  }

  /** Révoque un unique refresh token (déconnexion simple, /auth/logout). */
  async revoquerToken(refreshTokenEnClair: string): Promise<void> {
    const tokenHash = this.hacherToken(refreshTokenEnClair);
    await this.refreshTokenRepository.update({ tokenHash }, { revokedAt: new Date() });
  }

  /** Révoque TOUS les jetons actifs d'un utilisateur sur un appareil donné. */
  async revoquerTousLesJetons(utilisateurId: number, appareilId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { utilisateurId, appareilId, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  /** Tâche de maintenance : purge les jetons expirés depuis plus de 7 jours. */
  async purgerJetonsExpires(): Promise<number> {
    const seuil = new Date();
    seuil.setDate(seuil.getDate() - 7);
    const resultat = await this.refreshTokenRepository.delete({ expiresAt: LessThan(seuil) });
    return resultat.affected ?? 0;
  }

  private hacherToken(valeurEnClair: string): string {
    return crypto.createHash('sha256').update(valeurEnClair).digest('hex');
  }
}
