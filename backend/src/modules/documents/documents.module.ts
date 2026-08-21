import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './entities/document.entity';
import { DocumentPermission } from './entities/document-permission.entity';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';
import { DocumentsController } from './documents.controller';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentPermission, Dossier, Utilisateur]),
    JournalModule,
    NotificationsModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, StorageService],
  exports: [DocumentsService, StorageService],
})
export class DocumentsModule {}
