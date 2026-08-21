/**
 * backend/src/modules/assistant-ia/assistant-ia.controller.ts
 * Controller de l'Assistant IA Juridique
 */

import { Body, Controller, Post } from '@nestjs/common';
import { AssistantIaService, PoserQuestionDto } from './assistant-ia.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('assistant-ia')
export class AssistantIaController {
  constructor(private readonly assistantIaService: AssistantIaService) {}

  @Post('chat')
  async chat(
    @Body() body: PoserQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const reponse = await this.assistantIaService.poserQuestion(body, user);
    return { reponse };
  }
}
