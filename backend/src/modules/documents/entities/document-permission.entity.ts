import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('document_permissions')
export class DocumentPermission {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'document_id', type: 'bigint' })
  documentId: number;

  @Column({ name: 'dossier_id', type: 'bigint' })
  dossierId: number;

  @Column({ name: 'demandeur_id', type: 'bigint' })
  demandeurId: number;

  @Column({ name: 'demandeur_nom', type: 'varchar', length: 255, nullable: true })
  demandeurNom: string | null;

  @Column({ name: 'demandeur_telephone', type: 'varchar', length: 50, nullable: true })
  demandeurTelephone: string | null;

  @Column({ name: 'demandeur_email', type: 'varchar', length: 255, nullable: true })
  demandeurEmail: string | null;

  @Column({ name: 'createur_id', type: 'bigint' })
  createurId: number;

  @Column({ name: 'document_nom', type: 'varchar', length: 255, nullable: true })
  documentNom: string | null;

  @Column({ name: 'dossier_numero', type: 'varchar', length: 100, nullable: true })
  dossierNumero: string | null;

  @Column({ name: 'statut', type: 'varchar', length: 30, default: 'en_attente' })
  statut: 'en_attente' | 'autorisee' | 'refusee';

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}
