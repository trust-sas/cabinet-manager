import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Facture } from './entities/facture.entity';
import { Encaissement } from './entities/encaissement.entity';
import { FacturationService } from './facturation.service';
import { FacturationCronService } from './facturation-cron.service';
import { FacturationController } from './facturation.controller';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { Dossier } from '../dossiers/entities/dossier.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Facture, Encaissement, Dossier]),
    JournalModule,
    NotificationsModule,
  ],
  controllers: [FacturationController],
  providers: [FacturationService, FacturationCronService],
  exports: [FacturationService],
})
export class FacturationModule {}
