import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitationsService.create(dto, user);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.findAllForUser(user);
  }

  @Post(':id/repondre')
  @HttpCode(HttpStatus.OK)
  async repondre(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { accepter: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitationsService.repondre(id, body.accepter, user);
  }
}
