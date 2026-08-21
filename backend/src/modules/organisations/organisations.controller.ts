import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { OrganisationsService } from './organisations.service';
import {
  CreateOrganisationDto,
  UpdateOrganisationDto,
  AjouterMembreDto,
  TraiterDemandeDto,
  PartagerDossierDto,
  PartagerClientDto,
} from './dto/organisation.dto';

@UseGuards(AuthGuard('jwt-access'))
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly orgService: OrganisationsService) {}

  // ── CRUD Organisation ──────────────────────────────────────────────────────

  /** POST /organisations — Créer une organisation */
  @Post()
  creer(@Body() dto: CreateOrganisationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orgService.creer(dto, user);
  }

  /** PATCH /organisations/:nom — Modifier une organisation (chef only) */
  @Patch(':nom')
  modifier(
    @Param('nom') nom: string,
    @Body() dto: UpdateOrganisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.modifier(nom, dto, user);
  }

  /** DELETE /organisations/:nom — Supprimer une organisation (chef only) */
  @Delete(':nom')
  supprimer(@Param('nom') nom: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orgService.supprimer(nom, user);
  }

  /** GET /organisations — Lister toutes les organisations (pour recherche/rejoindre) */
  @Get()
  listerToutes() {
    return this.orgService.listerToutes();
  }

  /** GET /organisations/mes — Mes organisations */
  @Get('mes')
  mesMemberships(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.mesMemberships(user);
  }

  /** GET /organisations/:nom — Détails d'une organisation */
  @Get(':nom')
  getDetails(@Param('nom') nom: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orgService.getDetails(nom, user);
  }

  // ── Membres ────────────────────────────────────────────────────────────────

  /** POST /organisations/:nom/membres — Ajouter un membre (chef only) */
  @Post(':nom/membres')
  ajouterMembre(
    @Param('nom') nom: string,
    @Body() dto: AjouterMembreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.ajouterMembre(nom, dto, user);
  }

  /** DELETE /organisations/:nom/membres/:userId — Retirer un membre (chef only) */
  @Delete(':nom/membres/:userId')
  supprimerMembre(
    @Param('nom') nom: string,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.supprimerMembre(nom, userId, user);
  }

  // ── Demandes de rejoindre ──────────────────────────────────────────────────

  /** POST /organisations/:nom/rejoindre — Demander à rejoindre */
  @Post(':nom/rejoindre')
  demanderRejoindre(@Param('nom') nom: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orgService.demanderRejoindre(nom, user);
  }

  /** PATCH /organisations/demandes/:id — Approuver ou rejeter une demande (chef only) */
  @Patch('demandes/:id')
  traiterDemande(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TraiterDemandeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.traiterDemande(id, dto, user);
  }

  // ── Partage sélectif Dossiers ──────────────────────────────────────────────

  /** POST /organisations/:nom/dossiers — Partager un dossier */
  @Post(':nom/dossiers')
  partagerDossier(
    @Param('nom') nom: string,
    @Body() dto: PartagerDossierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.partagerDossier(nom, dto, user);
  }

  /** DELETE /organisations/:nom/dossiers/:dossierId — Retirer un dossier partagé */
  @Delete(':nom/dossiers/:dossierId')
  retirerDossier(
    @Param('nom') nom: string,
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.retirerDossier(nom, dossierId, user);
  }

  // ── Partage sélectif Clients ───────────────────────────────────────────────

  /** POST /organisations/:nom/clients — Partager un client */
  @Post(':nom/clients')
  partagerClient(
    @Param('nom') nom: string,
    @Body() dto: PartagerClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.partagerClient(nom, dto, user);
  }

  /** DELETE /organisations/:nom/clients/:clientId — Retirer un client partagé */
  @Delete(':nom/clients/:clientId')
  retirerClient(
    @Param('nom') nom: string,
    @Param('clientId', ParseIntPipe) clientId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.retirerClient(nom, clientId, user);
  }
}
