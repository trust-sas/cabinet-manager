/**
 * backend/src/modules/clients/clients.controller.ts
 * Endpoints REST pour la gestion des clients.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientsService, CreateClientDto, QueryClientsDto, UpdateClientDto } from './clients.service';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @RequirePermission('clients', 'read')
  @Get()
  async findAll(@Query() query: QueryClientsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findAll(query, user);
  }

  @RequirePermission('clients', 'read')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findOne(id, user);
  }

  @RequirePermission('clients', 'create')
  @Post()
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(dto, user.cabinetId);
  }

  @RequirePermission('clients', 'update')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, dto, user);
  }

  @RequirePermission('clients', 'delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    await this.clientsService.delete(id, user);
  }
}
