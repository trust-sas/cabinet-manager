import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organisation } from './organisation.entity';
import { Utilisateur } from '../../users/entities/utilisateur.entity';
import { Dossier } from '../../dossiers/entities/dossier.entity';

@Entity('organisation_dossiers')
export class OrganisationDossier {
  @PrimaryColumn({ name: 'organisation_nom', type: 'varchar', length: 150 })
  organisationNom: string;

  @PrimaryColumn({ name: 'dossier_id', type: 'bigint' })
  dossierId: number;

  @Column({ name: 'partage_par', type: 'bigint' })
  partagePar: number;

  @CreateDateColumn({ name: 'shared_at', type: 'timestamptz' })
  sharedAt: Date;

  @ManyToOne(() => Organisation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organisation_nom', referencedColumnName: 'nom' })
  organisation: Organisation;

  @ManyToOne(() => Dossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToOne(() => Utilisateur, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partage_par' })
  partageParUser: Utilisateur;
}
