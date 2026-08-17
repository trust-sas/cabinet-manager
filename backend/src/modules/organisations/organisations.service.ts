import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Organisation } from './entities/organisation.entity';
import { OrganisationMembre } from './entities/organisation-membre.entity';
import { OrganisationJoinRequest } from './entities/organisation-join-request.entity';
import { OrganisationDossier } from './entities/organisation-dossier.entity';
import { OrganisationClient } from './entities/organisation-client.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Client } from '../clients/entities/client.entity';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import {
  CreateOrganisationDto,
  UpdateOrganisationDto,
  TraiterDemandeDto,
  PartagerDossierDto,
  PartagerClientDto,
} from './dto/organisation.dto';

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectRepository(Organisation)
    private readonly orgRepo: Repository<Organisation>,
    @InjectRepository(OrganisationMembre)
    private readonly membreRepo: Repository<OrganisationMembre>,
    @InjectRepository(OrganisationJoinRequest)
    private readonly joinRequestRepo: Repository<OrganisationJoinRequest>,
    @InjectRepository(OrganisationDossier)
    private readonly orgDossierRepo: Repository<OrganisationDossier>,
    @InjectRepository(OrganisationClient)
    private readonly orgClientRepo: Repository<OrganisationClient>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Utilisateur)
    private readonly userRepo: Repository<Utilisateur>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── CRÉATION ──────────────────────────────────────────────────────────────

  async creer(dto: CreateOrganisationDto, user: AuthenticatedUser): Promise<Organisation> {
    const nomTrimmed = dto.nom.trim();

    const existe = await this.orgRepo.findOne({ where: { nom: nomTrimmed } });
    if (existe) {
      throw new ConflictException({
        error: {
          code: 'ORG_NAME_TAKEN',
          message: `Une organisation avec le nom "${nomTrimmed}" existe déjà. Veuillez choisir un autre nom.`,
          status: 409,
        },
      });
    }

    const org = this.orgRepo.create({
      nom: nomTrimmed,
      description: dto.description?.trim() || null,
      creatorId: user.id,
      deletedAt: null,
    });
    await this.orgRepo.save(org);

    const membre = this.membreRepo.create({
      organisationNom: nomTrimmed,
      userId: user.id,
      role: 'chef',
    });
    await this.membreRepo.save(membre);

    return org;
  }

  // ── MODIFICATION & SUPPRESSION ─────────────────────────────────────────────

  async modifier(nom: string, dto: UpdateOrganisationDto, user: AuthenticatedUser): Promise<Organisation> {
    await this.verifierChef(nom, user);

    const org = await this.orgRepo.findOne({ where: { nom, deletedAt: IsNull() } });
    if (!org) {
      throw new NotFoundException({
        error: { code: 'ORG_NOT_FOUND', message: 'Organisation introuvable.', status: 404 },
      });
    }

    if (dto.description !== undefined) {
      org.description = dto.description.trim() || null;
    }

    return this.orgRepo.save(org);
  }

  async supprimer(nom: string, user: AuthenticatedUser): Promise<void> {
    await this.verifierChef(nom, user);

    const org = await this.orgRepo.findOne({ where: { nom, deletedAt: IsNull() } });
    if (!org) {
      throw new NotFoundException({
        error: { code: 'ORG_NOT_FOUND', message: 'Organisation introuvable.', status: 404 },
      });
    }

    // Supprimer l'organisation (cascade supprime les liaisons dans l'org, préserve les dossiers/clients/users)
    await this.orgRepo.remove(org);
  }

  // ── LECTURE ───────────────────────────────────────────────────────────────

  async listerToutes(): Promise<Organisation[]> {
    return this.orgRepo.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async mesMemberships(user: AuthenticatedUser): Promise<any[]> {
    const memberships = await this.membreRepo.find({
      where: { userId: user.id },
      relations: ['organisation', 'organisation.creator'],
    });

    const results = await Promise.all(
      memberships
        .filter((m) => !m.organisation.deletedAt)
        .map(async (m) => {
          const nbMembres = await this.membreRepo.count({
            where: { organisationNom: m.organisationNom },
          });
          const nbDossiers = await this.orgDossierRepo.count({
            where: { organisationNom: m.organisationNom },
          });
          return {
            ...m.organisation,
            role: m.role,
            nbMembres,
            nbDossiers,
          };
        }),
    );

    return results;
  }

  async getDetails(nom: string, user: AuthenticatedUser): Promise<any> {
    const org = await this.orgRepo.findOne({
      where: { nom, deletedAt: IsNull() },
      relations: ['creator'],
    });
    if (!org) {
      throw new NotFoundException({
        error: { code: 'ORG_NOT_FOUND', message: 'Organisation introuvable.', status: 404 },
      });
    }

    const membership = await this.membreRepo.findOne({
      where: { organisationNom: nom, userId: user.id },
    });

    const membres = await this.membreRepo.find({
      where: { organisationNom: nom },
      relations: ['user'],
    });

    const dossierLinks = await this.orgDossierRepo.find({
      where: { organisationNom: nom },
      relations: ['dossier', 'dossier.client', 'partageParUser'],
    });

    const dossiers = dossierLinks.map((od) => ({
      id: od.dossier?.id,
      titre: od.dossier?.titre,
      numeroAffaire: od.dossier?.numeroAffaire,
      statut: od.dossier?.statut,
      juridiction: od.dossier?.juridiction,
      dateOuverture: od.dossier?.dateOuverture,
      proprietaireId: od.partagePar,
      proprietaireNom: od.partageParUser ? od.partageParUser.nom : 'Inconnu',
      estProprietaire: od.partagePar === user.id,
      sharedAt: od.sharedAt,
    }));

    const clientLinks = await this.orgClientRepo.find({
      where: { organisationNom: nom },
      relations: ['client'],
    });
    const clients = clientLinks.map((oc) => ({
      id: oc.client?.id,
      nomComplet: oc.client?.nomComplet,
      telephone: oc.client?.telephone,
      email: oc.client?.email,
      partagePar: oc.partagePar,
      estProprietaire: oc.partagePar === user.id,
    }));

    let demandesEnAttente: any[] = [];
    if (membership?.role === 'chef') {
      demandesEnAttente = await this.joinRequestRepo.find({
        where: { organisationNom: nom, statut: 'pending' },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });
    }

    return {
      ...org,
      role: membership?.role ?? null,
      estMembre: !!membership,
      membres: membres.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        nom: m.user ? m.user.nom : 'Inconnu',
        email: m.user?.email,
        telephone: m.user?.telephone,
      })),
      dossiers,
      clients,
      demandesEnAttente,
    };
  }

  // ── GESTION DES MEMBRES ────────────────────────────────────────────────────

  async ajouterMembre(nom: string, userId: number, chefUser: AuthenticatedUser): Promise<void> {
    await this.verifierChef(nom, chefUser);

    const userToAdd = await this.userRepo.findOne({ where: { id: userId } });
    if (!userToAdd) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.', status: 404 },
      });
    }

    const existe = await this.membreRepo.findOne({ where: { organisationNom: nom, userId } });
    if (existe) {
      throw new ConflictException({
        error: { code: 'ALREADY_MEMBER', message: "Cet utilisateur est déjà membre de l'organisation.", status: 409 },
      });
    }

    await this.membreRepo.save(this.membreRepo.create({ organisationNom: nom, userId, role: 'membre' }));

    await this.notificationsService.create(
      {
        utilisateurId: userId,
        type: NotificationType.INVITATION,
        titre: `Vous avez rejoint "${nom}"`,
        message: `Vous avez été ajouté(e) à l'organisation "${nom}".`,
      },
      chefUser.cabinetId,
    );
  }

  async supprimerMembre(nom: string, userId: number, chefUser: AuthenticatedUser): Promise<void> {
    await this.verifierChef(nom, chefUser);

    if (userId === chefUser.id) {
      throw new BadRequestException({
        error: { code: 'CANNOT_REMOVE_SELF', message: 'Le chef ne peut pas se retirer lui-même.', status: 400 },
      });
    }

    const membre = await this.membreRepo.findOne({ where: { organisationNom: nom, userId } });
    if (!membre) {
      throw new NotFoundException({
        error: { code: 'NOT_MEMBER', message: "Cet utilisateur n'est pas membre de l'organisation.", status: 404 },
      });
    }

    await this.membreRepo.remove(membre);
  }

  // ── DEMANDES DE REJOINDRE ──────────────────────────────────────────────────

  async demanderRejoindre(nom: string, user: AuthenticatedUser): Promise<void> {
    const org = await this.orgRepo.findOne({ where: { nom, deletedAt: IsNull() } });
    if (!org) {
      throw new NotFoundException({
        error: { code: 'ORG_NOT_FOUND', message: 'Organisation introuvable.', status: 404 },
      });
    }

    const estMembre = await this.membreRepo.findOne({ where: { organisationNom: nom, userId: user.id } });
    if (estMembre) {
      throw new ConflictException({
        error: { code: 'ALREADY_MEMBER', message: 'Vous êtes déjà membre de cette organisation.', status: 409 },
      });
    }

    const demandeExistante = await this.joinRequestRepo.findOne({
      where: { organisationNom: nom, userId: user.id, statut: 'pending' },
    });
    if (demandeExistante) {
      throw new ConflictException({
        error: { code: 'REQUEST_PENDING', message: 'Une demande est déjà en attente pour cette organisation.', status: 409 },
      });
    }

    await this.joinRequestRepo.save(
      this.joinRequestRepo.create({ organisationNom: nom, userId: user.id, statut: 'pending' }),
    );

    await this.notificationsService.create(
      {
        utilisateurId: org.creatorId,
        type: NotificationType.INVITATION,
        titre: `Demande d'adhésion à "${nom}"`,
        message: `Un utilisateur demande à rejoindre votre organisation "${nom}".`,
      },
      user.cabinetId,
    );
  }

  async traiterDemande(requestId: number, dto: TraiterDemandeDto, chefUser: AuthenticatedUser): Promise<void> {
    const demande = await this.joinRequestRepo.findOne({
      where: { id: requestId },
      relations: ['organisation'],
    });
    if (!demande) {
      throw new NotFoundException({
        error: { code: 'REQUEST_NOT_FOUND', message: 'Demande introuvable.', status: 404 },
      });
    }

    await this.verifierChef(demande.organisationNom, chefUser);

    demande.statut = dto.action;
    await this.joinRequestRepo.save(demande);

    if (dto.action === 'accepted') {
      const existe = await this.membreRepo.findOne({
        where: { organisationNom: demande.organisationNom, userId: demande.userId },
      });
      if (!existe) {
        await this.membreRepo.save(
          this.membreRepo.create({ organisationNom: demande.organisationNom, userId: demande.userId, role: 'membre' }),
        );
      }

      await this.notificationsService.create(
        {
          utilisateurId: demande.userId,
          type: NotificationType.INVITATION,
          titre: `Adhésion acceptée : "${demande.organisationNom}"`,
          message: `Votre demande d'adhésion à l'organisation "${demande.organisationNom}" a été acceptée !`,
        },
        chefUser.cabinetId,
      );
    } else {
      await this.notificationsService.create(
        {
          utilisateurId: demande.userId,
          type: NotificationType.INVITATION,
          titre: `Demande refusée : "${demande.organisationNom}"`,
          message: `Votre demande d'adhésion à l'organisation "${demande.organisationNom}" a été refusée.`,
        },
        chefUser.cabinetId,
      );
    }
  }

  // ── PARTAGE SÉLECTIF ───────────────────────────────────────────────────────

  async partagerDossier(nom: string, dto: PartagerDossierDto, user: AuthenticatedUser): Promise<void> {
    await this.verifierMembre(nom, user);

    const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossierId, deletedAt: IsNull() } });
    if (!dossier) {
      throw new NotFoundException({
        error: { code: 'DOSSIER_NOT_FOUND', message: 'Dossier introuvable.', status: 404 },
      });
    }

    const existe = await this.orgDossierRepo.findOne({ where: { organisationNom: nom, dossierId: dto.dossierId } });
    if (existe) {
      throw new ConflictException({
        error: { code: 'ALREADY_SHARED', message: 'Ce dossier est déjà partagé dans cette organisation.', status: 409 },
      });
    }

    await this.orgDossierRepo.save(
      this.orgDossierRepo.create({ organisationNom: nom, dossierId: dto.dossierId, partagePar: user.id }),
    );
  }

  async retirerDossier(nom: string, dossierId: number, user: AuthenticatedUser): Promise<void> {
    const link = await this.orgDossierRepo.findOne({ where: { organisationNom: nom, dossierId } });
    if (!link) {
      throw new NotFoundException({
        error: { code: 'NOT_SHARED', message: "Ce dossier n'est pas partagé dans cette organisation.", status: 404 },
      });
    }

    const isChef = await this.membreRepo.findOne({ where: { organisationNom: nom, userId: user.id, role: 'chef' } });
    if (link.partagePar !== user.id && !isChef) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Seul le propriétaire du dossier ou le chef peut le retirer.', status: 403 },
      });
    }

    await this.orgDossierRepo.remove(link);
  }

  async partagerClient(nom: string, dto: PartagerClientDto, user: AuthenticatedUser): Promise<void> {
    await this.verifierMembre(nom, user);

    const client = await this.clientRepo.findOne({ where: { id: dto.clientId, deletedAt: IsNull() } });
    if (!client) {
      throw new NotFoundException({
        error: { code: 'CLIENT_NOT_FOUND', message: 'Client introuvable.', status: 404 },
      });
    }

    const existe = await this.orgClientRepo.findOne({ where: { organisationNom: nom, clientId: dto.clientId } });
    if (existe) {
      throw new ConflictException({
        error: { code: 'ALREADY_SHARED', message: 'Ce client est déjà partagé dans cette organisation.', status: 409 },
      });
    }

    await this.orgClientRepo.save(
      this.orgClientRepo.create({ organisationNom: nom, clientId: dto.clientId, partagePar: user.id }),
    );
  }

  async retirerClient(nom: string, clientId: number, user: AuthenticatedUser): Promise<void> {
    const link = await this.orgClientRepo.findOne({ where: { organisationNom: nom, clientId } });
    if (!link) {
      throw new NotFoundException({
        error: { code: 'NOT_SHARED', message: "Ce client n'est pas partagé dans cette organisation.", status: 404 },
      });
    }

    const isChef = await this.membreRepo.findOne({ where: { organisationNom: nom, userId: user.id, role: 'chef' } });
    if (link.partagePar !== user.id && !isChef) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Seul le propriétaire ou le chef peut retirer ce client.', status: 403 },
      });
    }

    await this.orgClientRepo.remove(link);
  }

  // ── HELPERS PRIVÉS ─────────────────────────────────────────────────────────

  private async verifierChef(nom: string, user: AuthenticatedUser): Promise<void> {
    const membership = await this.membreRepo.findOne({ where: { organisationNom: nom, userId: user.id } });
    if (!membership || membership.role !== 'chef') {
      throw new ForbiddenException({
        error: { code: 'NOT_CHEF', message: "Seul le chef de l'organisation peut effectuer cette action.", status: 403 },
      });
    }
  }

  private async verifierMembre(nom: string, user: AuthenticatedUser): Promise<void> {
    const membership = await this.membreRepo.findOne({ where: { organisationNom: nom, userId: user.id } });
    if (!membership) {
      throw new ForbiddenException({
        error: { code: 'NOT_MEMBER', message: "Vous n'êtes pas membre de cette organisation.", status: 403 },
      });
    }
  }
}
