/**
 * backend/src/app.module.ts
 * ---------------------------------------------------------------------------
 * Module racine de l'application Cabinet Manager.
 * ---------------------------------------------------------------------------
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AudiencesModule } from './modules/audiences/audiences.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DossiersModule } from './modules/dossiers/dossiers.module';
import { FacturationModule } from './modules/facturation/facturation.module';
import { JournalModule } from './modules/journal/journal.module';
import { UsersModule } from './modules/users/users.module';

import { HealthController } from './health.controller';
import { Audience } from './modules/audiences/entities/audience.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { Client } from './modules/clients/entities/client.entity';
import { Document } from './modules/documents/entities/document.entity';
import { DocumentPermission } from './modules/documents/entities/document-permission.entity';
import { Dossier } from './modules/dossiers/entities/dossier.entity';
import { Encaissement } from './modules/facturation/entities/encaissement.entity';
import { Facture } from './modules/facturation/entities/facture.entity';
import { JournalActivite } from './modules/journal/entities/journal-activite.entity';
import { Cabinet } from './modules/users/entities/cabinet.entity';
import { RoleAcces } from './modules/users/entities/role-acces.entity';
import { Utilisateur } from './modules/users/entities/utilisateur.entity';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { Notification } from './modules/notifications/entities/notification.entity';
import { TexteLoi } from './modules/assistant-ia/entities/texte-loi.entity';

import { SyncModule } from './modules/sync/sync.module';
import { AssistantIaModule } from './modules/assistant-ia/assistant-ia.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { DossierInvitationEntity } from './modules/invitations/entities/dossier-invitation.entity';
import { OrganisationsModule } from './modules/organisations/organisations.module';
import { Organisation } from './modules/organisations/entities/organisation.entity';
import { OrganisationMembre } from './modules/organisations/entities/organisation-membre.entity';
import { OrganisationJoinRequest } from './modules/organisations/entities/organisation-join-request.entity';
import { OrganisationDossier } from './modules/organisations/entities/organisation-dossier.entity';
import { OrganisationClient } from './modules/organisations/entities/organisation-client.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || undefined,
      host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST ?? 'localhost'),
      port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DATABASE_URL ? undefined : (process.env.DB_NAME ?? 'cabinet_manager'),
      username: process.env.DATABASE_URL ? undefined : (process.env.DB_USER ?? 'cm_app_user'),
      password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
      entities: [
        Utilisateur,
        Cabinet,
        RoleAcces,
        RefreshToken,
        Dossier,
        Client,
        JournalActivite,
        Audience,
        Document,
        DocumentPermission,
        Facture,
        Encaissement,
        Notification,
        TexteLoi,
        DossierInvitationEntity,
        Organisation,
        OrganisationMembre,
        OrganisationJoinRequest,
        OrganisationDossier,
        OrganisationClient,
      ],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
    }),
    UsersModule,
    AuthModule,
    ClientsModule,
    JournalModule,
    DossiersModule,
    AudiencesModule,
    DocumentsModule,
    FacturationModule,
    NotificationsModule,
    InvitationsModule,
    SyncModule,
    AssistantIaModule,
    OrganisationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
