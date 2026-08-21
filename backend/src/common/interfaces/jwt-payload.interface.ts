/**
 * common/interfaces/jwt-payload.interface.ts
 * ---------------------------------------------------------------------------
 * Forme exacte du contenu (payload) encodé dans les jetons JWT.
 * Centraliser ce type ici évite les fautes de frappe sur les noms de champs
 * (ex. "sub" vs "userId") entre l'endroit où le jeton est signé (TokenService)
 * et l'endroit où il est lu (JwtStrategy, décorateur @CurrentUser).
 * ---------------------------------------------------------------------------
 */

/** Payload du jeton d'accès (courte durée de vie, ex. 15 minutes). */
export interface AccessTokenPayload {
  /** "sub" = subject = id de l'utilisateur (convention standard JWT). */
  sub: number;
  /** Cabinet auquel appartient l'utilisateur (isolation multi-tenant). */
  cabinetId: number;
  /** Rôle "haut niveau" (Avocat, Assistant, Associe, Administrateur). */
  role: string;
  /** Liste des permissions RBAC résolues, ex. ["dossiers:read:own", ...]. */
  permissions: string[];
  /** Confirme que l'utilisateur a bien validé son 2FA sur cette session. */
  twoFactorVerified: boolean;
  /** Adresse email de l'utilisateur. */
  email?: string;
  /** Numéro de téléphone de l'utilisateur. */
  telephone?: string;
}

/** Payload du jeton de rafraîchissement (longue durée de vie, ex. 30 jours). */
export interface RefreshTokenPayload {
  sub: number;
  /** Identifiant unique du jeton en base (permet la révocation ciblée). */
  jti: string;
  /** Identifiant de l'appareil mobile/navigateur ayant demandé le jeton. */
  appareilId: string;
}

/**
 * Forme finale attachée à `request.user` par Passport une fois le jeton
 * vérifié. On y ajoute le payload complet pour que les guards RBAC puissent
 * lire les permissions sans re-interroger la base à chaque requête.
 */
export interface AuthenticatedUser {
  id: number;
  cabinetId: number;
  role: string;
  permissions: string[];
  email?: string;
  telephone?: string;
}
