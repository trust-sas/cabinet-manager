/**
 * backend/src/modules/journal/journal.controller.ts
 * Controller REST d'administration du journal d'activité et de traçabilité (Audit Trail).
 */

import {
  Controller, Get, Param, ParseIntPipe, Post, Query, Body, BadRequestException,
} from '@nestjs/common';
import { JournalService, QueryJournalDto } from './journal.service';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @RequirePermission('journal', 'read')
  @Get()
  findAll(
    @Query() query: QueryJournalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.findAll(query, user);
  }

  @RequirePermission('journal', 'read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.findOne(id, user);
  }

  @Post('commentaire')
  async posterCommentaire(
    @Body() dto: { message: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const text = (dto.message || '').trim();
    if (!text) {
      throw new BadRequestException('Le commentaire ne peut pas être vide.');
    }
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId || 1,
      utilisateurId: user.id,
      action: 'commentaire_utilisateur',
      entiteType: 'Commentaire',
      entiteId: user.id,
      donneesApres: {
        auteurId: user.id,
        role: user.role,
        commentaire: text,
        date: new Date().toISOString(),
      },
    });
    return { success: true, message: 'Commentaire transmis aux administrateurs.' };
  }

  @RequirePermission('journal', 'update')
  @Post(':id/restaurer')
  restaurer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.restaurer(id, user);
  }
}
