import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audience } from './entities/audience.entity';
import { AudiencesService } from './audiences.service';
import { AudiencesController } from './audiences.controller';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [TypeOrmModule.forFeature([Audience, Dossier]), JournalModule],
  controllers: [AudiencesController],
  providers: [AudiencesService],
  exports: [AudiencesService],
})
export class AudiencesModule {}
