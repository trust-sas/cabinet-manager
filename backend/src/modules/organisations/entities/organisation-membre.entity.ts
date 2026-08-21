import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organisation } from './organisation.entity';
import { Utilisateur } from '../../users/entities/utilisateur.entity';

export type OrganisationRole = 'chef' | 'membre';

@Entity('organisation_membres')
export class OrganisationMembre {
  @PrimaryColumn({ name: 'organisation_nom', type: 'varchar', length: 150 })
  organisationNom: string;

  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'role', type: 'varchar', length: 20, default: 'membre' })
  role: OrganisationRole;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date;

  @ManyToOne(() => Organisation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organisation_nom', referencedColumnName: 'nom' })
  organisation: Organisation;

  @ManyToOne(() => Utilisateur, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Utilisateur;
}
