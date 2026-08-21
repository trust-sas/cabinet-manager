/**
 * backend/src/modules/assistant-ia/assistant-ia.module.ts
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistantIaController } from './assistant-ia.controller';
import { AssistantIaService } from './assistant-ia.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Client } from '../clients/entities/client.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facturation/entities/facture.entity';
import { Document } from '../documents/entities/document.entity';
import { TexteLoi } from './entities/texte-loi.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dossier, Client, Audience, Facture, Document, TexteLoi]),
  ],
  controllers: [AssistantIaController],
  providers: [AssistantIaService],
  exports: [AssistantIaService],
})
export class AssistantIaModule {}
