/**
 * modules/users/entities/utilisateur.entity.ts
 * ---------------------------------------------------------------------------
 * Mappe la table `utilisateurs`. Inclut les colonnes ajoutées par la
 * migration 002 (postgres/migration_002_auth_module.sql) nécessaires au
 * module Authentification : compteur d'échecs de connexion, verrouillage
 * temporaire, secret 2FA.
 *
 * IMPORTANT SÉCURITÉ : le champ mot_de_passe_hash ne doit JAMAIS être renvoyé
 * tel quel dans une réponse HTTP. Voir UsersService.toSafeProfile() qui
 * construit systématiquement une version "publique" sans champs sensibles.
 * ---------------------------------------------------------------------------
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cabinet } from './cabinet.entity';
import { RoleAcces, RoleLibelle } from './role-acces.entity';

@Entity('utilisateurs')
export class Utilisateur {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'cabinet_id', type: 'bigint' })
  cabinetId: number;

  @ManyToOne(() => Cabinet)
  @JoinColumn({ name: 'cabinet_id' })
  cabinet: Cabinet;

  @Column({ name: 'role_acces_id', type: 'bigint' })
  roleAccesId: number;

  @ManyToOne(() => RoleAcces, (role) => role.utilisateurs, { eager: true })
  @JoinColumn({ name: 'role_acces_id' })
  roleAcces: RoleAcces;

  @Column({ name: 'nom', type: 'varchar', length: 150 })
  nom: string;

  /* Authentification par email mise en commentaire / optionnelle
  @Column({ name: 'email', type: 'varchar', length: 150 })
  email: string;
  */
  @Column({ name: 'email', type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'telephone', type: 'varchar', length: 50, nullable: true })
  telephone: string | null;

  /** Haché avec argon2id — voir modules/auth/hashing (jamais en clair). */
  @Column({ name: 'mot_de_passe_hash', type: 'varchar', length: 255 })
  motDePasseHash: string;

  @Column({ name: 'role', type: 'enum', enum: RoleLibelle, enumName: 'role_libelle' })
  role: RoleLibelle;

  @Column({ name: 'authentif_2fa_actif', type: 'boolean', default: false })
  authentif2faActif: boolean;

  /** Secret TOTP, chiffré au repos au niveau applicatif avant stockage. */
  @Column({ name: 'authentif_2fa_secret', type: 'varchar', length: 255, nullable: true })
  authentif2faSecret: string | null;

  @Column({ name: 'actif', type: 'boolean', default: true })
  actif: boolean;

  @Column({ name: 'derniere_connexion', type: 'timestamptz', nullable: true })
  derniereConnexion: Date | null;

  /**
   * --- Colonnes ajoutées par la migration 002 (module Authentification) ---
   * Protection anti-bruteforce : nombre d'échecs consécutifs et horodatage
   * jusqu'auquel le compte est verrouillé (voir AuthService.enregistrerEchec).
   */
  @Column({ name: 'echecs_connexion', type: 'int', default: 0 })
  echecsConnexion: number;

  @Column({ name: 'verrouille_jusqu_a', type: 'timestamptz', nullable: true })
  verrouilleJusquA: Date | null;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /**
   * Token Expo Push (ExponentPushToken[xxxx]) enregistré par l'appareil mobile.
   * Mis à jour automatiquement au login via POST /auth/push-token.
   * Utilisé par MessagingService.envoyerPush() pour les notifications natives.
   */
  @Column({ name: 'expo_push_token', type: 'varchar', length: 200, nullable: true })
  expoPushToken: string | null;
}
