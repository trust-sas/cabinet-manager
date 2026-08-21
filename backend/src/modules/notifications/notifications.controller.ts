/**
 * backend/src/modules/notifications/notifications.controller.ts
 * Endpoints REST pour la consultation et le suivi des notifications.
 */

import {
  Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.notificationsService.findAllForUser(
      user,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.compterNonLues(user);
    return { count };
  }

  @Patch(':id/lire')
  async marquerCommeLue(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.marquerCommeLue(id, user);
  }

  @Patch('lire-tout')
  async marquerToutCommeLu(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.marquerToutCommeLu(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async supprimer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.supprimer(id, user);
  }
}
