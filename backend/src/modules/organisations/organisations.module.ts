import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organisation } from './entities/organisation.entity';
import { OrganisationMembre } from './entities/organisation-membre.entity';
import { OrganisationJoinRequest } from './entities/organisation-join-request.entity';
import { OrganisationDossier } from './entities/organisation-dossier.entity';
import { OrganisationClient } from './entities/organisation-client.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Client } from '../clients/entities/client.entity';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { OrganisationsService } from './organisations.service';
import { OrganisationsController } from './organisations.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organisation,
      OrganisationMembre,
      OrganisationJoinRequest,
      OrganisationDossier,
      OrganisationClient,
      Dossier,
      Client,
      Utilisateur,
    ]),
    NotificationsModule,
  ],
  controllers: [OrganisationsController],
  providers: [OrganisationsService],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
