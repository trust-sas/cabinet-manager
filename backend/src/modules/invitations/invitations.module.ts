import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { UsersModule } from '../users/users.module';
import { DossierInvitationEntity } from './entities/dossier-invitation.entity';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DossierInvitationEntity, Dossier, Utilisateur]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
