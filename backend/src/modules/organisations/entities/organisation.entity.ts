import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Utilisateur } from '../../users/entities/utilisateur.entity';

@Entity('organisations')
export class Organisation {
  @PrimaryColumn({ name: 'nom', type: 'varchar', length: 150 })
  nom: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'creator_id', type: 'bigint' })
  creatorId: number;

  @ManyToOne(() => Utilisateur, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'creator_id' })
  creator: Utilisateur;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
