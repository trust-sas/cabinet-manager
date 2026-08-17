/**
 * backend/src/modules/notifications/entities/notification.entity.ts
 * Entité représentant une notification utilisateur (Rappel d'audience, facture en retard, RDV).
 */

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum NotificationType {
  AUDIENCE_RAPPEL     = 'audience_rappel',
  FACTURE_RETARD      = 'facture_retard',
  RDV_RAPPEL          = 'rdv_rappel',
  INFO                = 'info',
  INVITATION          = 'invitation',
  PERMISSION_REQUETE  = 'permission_requete',
  PERMISSION_REPONSE  = 'permission_reponse',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'cabinet_id', type: 'bigint' })
  cabinetId: number;

  @Column({ name: 'utilisateur_id', type: 'bigint' })
  utilisateurId: number;

  @Column({ name: 'titre', type: 'varchar', length: 255 })
  titre: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'type', type: 'varchar', length: 50, default: NotificationType.INFO })
  type: NotificationType;

  @Column({ name: 'lu', type: 'boolean', default: false })
  lu: boolean;

  @Column({ name: 'entite_type', type: 'varchar', length: 50, nullable: true })
  entiteType: string | null;

  @Column({ name: 'entite_id', type: 'bigint', nullable: true })
  entiteId: number | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
