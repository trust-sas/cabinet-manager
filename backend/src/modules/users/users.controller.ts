/**
 * backend/src/modules/users/users.controller.ts
 * Endpoints REST pour la gestion des utilisateurs par l'Administrateur.
 */
import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

import { Public } from '../../common/decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Get('check-email/:email')
  async checkEmail(@Param('email') email: string) {
    if (!email) return { exists: false };
    const u = await this.usersService.findByEmail(email.trim().toLowerCase());
    return { exists: !!u, user: u ? { id: u.id, nom: u.nom, email: u.email } : null };
  }

  @RequirePermission('users', 'read')
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.cabinetId);
  }

  @RequirePermission('users', 'read')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const u = await this.usersService.findById(id);
    return this.usersService.toSafeProfile(u);
  }

  @RequirePermission('users', 'update')
  @Patch(':id/activer')
  async activer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setActifStatus(id, user.cabinetId, true);
  }

  @RequirePermission('users', 'update')
  @Patch(':id/desactiver')
  async desactiver(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setActifStatus(id, user.cabinetId, false);
  }

  @RequirePermission('users', 'update')
  @Delete(':id')
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.deleteUser(id, user.cabinetId, user.id);
  }
}
