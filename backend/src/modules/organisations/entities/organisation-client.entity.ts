import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organisation } from './organisation.entity';
import { Utilisateur } from '../../users/entities/utilisateur.entity';
import { Client } from '../../clients/entities/client.entity';

@Entity('organisation_clients')
export class OrganisationClient {
  @PrimaryColumn({ name: 'organisation_nom', type: 'varchar', length: 150 })
  organisationNom: string;

  @PrimaryColumn({ name: 'client_id', type: 'bigint' })
  clientId: number;

  @Column({ name: 'partage_par', type: 'bigint' })
  partagePar: number;

  @CreateDateColumn({ name: 'shared_at', type: 'timestamptz' })
  sharedAt: Date;

  @ManyToOne(() => Organisation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organisation_nom', referencedColumnName: 'nom' })
  organisation: Organisation;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Utilisateur, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partage_par' })
  partageParUser: Utilisateur;
}
