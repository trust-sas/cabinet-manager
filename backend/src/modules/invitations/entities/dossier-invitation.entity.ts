import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvitationStatut = 'en_attente' | 'acceptee' | 'refusee';

@Entity('dossier_invitations')
export class DossierInvitationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cabinet_id' })
  cabinetId: number;

  @Column({ name: 'dossier_id' })
  dossierId: number;

  @Column({ name: 'dossier_numero' })
  dossierNumero: string;

  @Column({ name: 'dossier_titre' })
  dossierTitre: string;

  @Column({ type: 'varchar', name: 'juridiction', nullable: true })
  juridiction: string | null;

  @Column({ name: 'inviteur_id' })
  inviteurId: number;

  @Column({ name: 'inviteur_nom' })
  inviteurNom: string;

  /** Numéro de téléphone de l'inviteur (identifiant principal) */
  @Column({ type: 'varchar', name: 'inviteur_telephone', nullable: true })
  inviteurTelephone: string | null;

  /** @deprecated Email de l'inviteur — optionnel avec auth téléphone */
  @Column({ type: 'varchar', name: 'inviteur_email', nullable: true })
  inviteurEmail: string | null;

  @Column({ type: 'int', name: 'destinataire_id', nullable: true })
  destinataireId: number | null;

  /** Numéro de téléphone du destinataire (identifiant principal) */
  @Column({ type: 'varchar', name: 'destinataire_telephone', nullable: true })
  destinataireTelephone: string | null;

  /** @deprecated Email du destinataire — optionnel avec auth téléphone */
  @Column({ type: 'varchar', name: 'destinataire_email', nullable: true })
  destinataireEmail: string | null;

  @Column({ type: 'varchar', default: 'en_attente' })
  statut: InvitationStatut;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
