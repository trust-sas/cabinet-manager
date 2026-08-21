import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique } from 'typeorm';
import { Organisation } from './organisation.entity';
import { Utilisateur } from '../../users/entities/utilisateur.entity';

export type JoinRequestStatut = 'pending' | 'accepted' | 'rejected';

@Entity('organisation_join_requests')
@Unique(['organisationNom', 'userId'])
export class OrganisationJoinRequest {
  @PrimaryGeneratedColumn({ name: 'id', type: 'int' })
  id: number;

  @Column({ name: 'organisation_nom', type: 'varchar', length: 150 })
  organisationNom: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'statut', type: 'varchar', length: 20, default: 'pending' })
  statut: JoinRequestStatut;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Organisation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organisation_nom', referencedColumnName: 'nom' })
  organisation: Organisation;

  @ManyToOne(() => Utilisateur, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Utilisateur;
}
