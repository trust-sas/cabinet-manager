/**
 * modules/dossiers/entities/dossier.entity.ts
 * ---------------------------------------------------------------------------
 * Mappe la table `dossiers`. Voir schema_cabinet_manager.sql pour la
 * définition SQL complète (contraintes, index).
 * ---------------------------------------------------------------------------
 */
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Utilisateur } from '../../users/entities/utilisateur.entity';

export enum DossierStatut {
  OUVERT = 'Ouvert',
  EN_COURS = 'En cours',
  CLOTURE = 'Cloture',
}

@Entity('dossiers')
export class Dossier {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'cabinet_id', type: 'bigint' })
  cabinetId: number;

  @Column({ name: 'client_id', type: 'bigint' })
  clientId: number;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'avocat_responsable_id', type: 'bigint' })
  avocatResponsableId: number;

  @ManyToOne(() => Utilisateur)
  @JoinColumn({ name: 'avocat_responsable_id' })
  avocatResponsable: Utilisateur;

  @Column({ name: 'numero_affaire', type: 'varchar', length: 50 })
  numeroAffaire: string;

  @Column({ name: 'titre', type: 'varchar', length: 255 })
  titre: string;

  @Column({ name: 'statut', type: 'enum', enum: DossierStatut, default: DossierStatut.OUVERT })
  statut: DossierStatut;

  @Column({ name: 'date_ouverture', type: 'date' })
  dateOuverture: Date;

  @Column({ name: 'date_cloture', type: 'date', nullable: true })
  dateCloture: Date | null;

  @Column({ name: 'juridiction', type: 'varchar', length: 150, nullable: true })
  juridiction: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  /** UUID généré côté mobile pour les créations hors-ligne (idempotence). */
  @Column({ name: 'client_uuid', type: 'uuid', nullable: true })
  clientUuid: string | null;

  @Column({ name: 'est_public', type: 'boolean', default: true })
  estPublic: boolean;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
