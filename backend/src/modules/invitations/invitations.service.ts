import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { UsersService } from '../users/users.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { DossierInvitationEntity } from './entities/dossier-invitation.entity';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(DossierInvitationEntity)
    private readonly invitationRepository: Repository<DossierInvitationEntity>,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(Utilisateur)
    private readonly utilisateurRepository: Repository<Utilisateur>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateInvitationDto, inviteurUser: AuthenticatedUser): Promise<DossierInvitationEntity> {
    // Identifiant du destinataire : téléphone en priorité, email en fallback
    const destTelephone = (dto.destinataireTelephone || '').trim().replace(/\s+/g, '');
    const destEmail = (dto.destinataireEmail || '').trim().toLowerCase();

    if (!destTelephone && !destEmail) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Le numéro de téléphone du destinataire est obligatoire.', status: 400 },
      });
    }

    // 1. Recherche du destinataire — téléphone en priorité, email en fallback
    let destinataire: Utilisateur | null = null;
    if (destTelephone) {
      destinataire = await this.usersService.findByTelephone(destTelephone);
    }
    if (!destinataire && destEmail) {
      destinataire = await this.usersService.findByEmail(destEmail);
    }

    if (!destinataire) {
      const identifiantAffiche = destTelephone || destEmail;
      throw new NotFoundException({
        error: {
          code: 'USER_NOT_FOUND',
          message: `Le numéro "${identifiantAffiche}" ne correspond à aucun utilisateur enregistré dans l'application.`,
          status: 404,
        },
      });
    }

    // 2. Vérification du mot de passe de l'expéditeur
    const inviteurUtilisateur = await this.utilisateurRepository.findOne({
      where: { id: inviteurUser.id },
    });

    if (!inviteurUtilisateur || !inviteurUtilisateur.motDePasseHash) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Utilisateur non authentifié.', status: 401 },
      });
    }

    const motDePasseValide = await argon2.verify(
      inviteurUtilisateur.motDePasseHash,
      dto.motDePasse,
    );

    if (!motDePasseValide) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_PASSWORD',
          message: "Mot de passe incorrect. Impossible d'envoyer l'invitation.",
          status: 401,
        },
      });
    }

    // 3. Récupération du dossier
    const dossier = await this.dossierRepository.findOne({
      where: { id: dto.dossierId, cabinetId: inviteurUser.cabinetId },
    });

    if (!dossier) {
      throw new NotFoundException({
        error: { code: 'DOSSIER_NOT_FOUND', message: 'Dossier introuvable.', status: 404 },
      });
    }

    // 4. Vérification doublon : invitation déjà envoyée et encore valide (< 7 jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const existingInv = await this.invitationRepository
      .createQueryBuilder('inv')
      .where('inv.dossierId = :dossierId', { dossierId: dto.dossierId })
      .andWhere('inv.destinataireId = :userId', { userId: destinataire.id })
      .andWhere('inv.statut = :statut', { statut: 'en_attente' })
      .andWhere('inv.createdAt > :limit', { limit: sevenDaysAgo })
      .getOne();

    if (existingInv) {
      const expiresAt = new Date(existingInv.createdAt);
      expiresAt.setDate(expiresAt.getDate() + 7);
      const joursRestants = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
      throw new ConflictException({
        error: {
          code: 'INVITATION_ALREADY_SENT',
          message: `Une invitation a déjà été envoyée pour ce dossier. Elle expire dans ${joursRestants} jour(s). Veuillez attendre sa réponse ou son expiration.`,
          status: 409,
        },
      });
    }

    // 5. Création et enregistrement de l'invitation
    const inv = this.invitationRepository.create({
      cabinetId: inviteurUser.cabinetId,
      dossierId: dossier.id,
      dossierNumero: dossier.numeroAffaire,
      dossierTitre: dossier.titre,
      juridiction: dossier.juridiction || 'Tribunal',
      inviteurId: inviteurUtilisateur.id,
      inviteurNom: inviteurUtilisateur.nom,
      inviteurTelephone: inviteurUtilisateur.telephone || null,
      inviteurEmail: inviteurUtilisateur.email || null,
      destinataireId: destinataire.id,
      destinataireTelephone: destinataire.telephone || destTelephone || null,
      destinataireEmail: destinataire.email || destEmail || null,
      statut: 'en_attente',
    });

    const savedInv = await this.invitationRepository.save(inv);

    // 6. Notification push pour le destinataire
    const inviteurIdentifiant = inviteurUtilisateur.telephone || inviteurUtilisateur.email || inviteurUtilisateur.nom;
    await this.notificationsService.create(
      {
        utilisateurId: destinataire.id,
        titre: `📩 Invitation au dossier ${dossier.numeroAffaire}`,
        message: `${inviteurUtilisateur.nom} (${inviteurIdentifiant}) vous a invité à rejoindre le dossier "${dossier.titre}".`,
        type: NotificationType.INFO,
        entiteType: 'dossier',
        entiteId: dossier.id,
      },
      destinataire.cabinetId,
    );

    return savedInv;
  }

  async findAllForUser(user: AuthenticatedUser): Promise<DossierInvitationEntity[]> {
    const currentUser = await this.utilisateurRepository.findOne({
      where: { id: user.id },
    });
    if (!currentUser) return [];

    const telephoneClean = (currentUser.telephone || '').trim().replace(/\s+/g, '');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Seul le destinataire voit les invitations reçues dans sa boîte
    const qb = this.invitationRepository
      .createQueryBuilder('inv')
      .where('inv.destinataireId = :userId', { userId: user.id });

    if (telephoneClean) {
      qb.orWhere('inv.destinataireTelephone = :tel', { tel: telephoneClean });
    }

    return qb
      .andWhere('(inv.statut != :statut OR inv.createdAt > :limit)', {
        statut: 'en_attente',
        limit: sevenDaysAgo,
      })
      .orderBy('inv.id', 'DESC')
      .getMany();
  }

  async repondre(
    id: number,
    accepter: boolean,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string; invitation: DossierInvitationEntity }> {
    const inv = await this.invitationRepository.findOne({ where: { id } });
    if (!inv) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Invitation introuvable.', status: 404 },
      });
    }

    // Vérification expiration (7 jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (inv.statut === 'en_attente' && new Date(inv.createdAt) < sevenDaysAgo) {
      inv.statut = 'refusee';
      await this.invitationRepository.save(inv);
      throw new BadRequestException({
        error: {
          code: 'INVITATION_EXPIRED',
          message: 'Cette invitation a expiré (délai de 7 jours dépassé). Elle a été automatiquement annulée.',
          status: 400,
        },
      });
    }

    const currentUtilisateur = await this.utilisateurRepository.findOne({
      where: { id: user.id },
    });

    inv.destinataireId = user.id;
    inv.statut = accepter ? 'acceptee' : 'refusee';
    const updated = await this.invitationRepository.save(inv);

    // Notification retour pour l'expéditeur
    const destinataireIdentifiant = currentUtilisateur?.telephone
      || currentUtilisateur?.email
      || String(user.id);

    await this.notificationsService.create(
      {
        utilisateurId: inv.inviteurId,
        titre: accepter
          ? `✅ Invitation acceptée pour ${inv.dossierNumero}`
          : `❌ Invitation refusée pour ${inv.dossierNumero}`,
        message: `${currentUtilisateur?.nom || destinataireIdentifiant} a ${accepter ? 'accepté' : 'refusé'} votre invitation pour le dossier "${inv.dossierTitre}".`,
        type: NotificationType.INFO,
        entiteType: 'dossier',
        entiteId: inv.dossierId,
      },
      inv.cabinetId,
    );

    return {
      success: true,
      message: accepter
        ? `Invitation acceptée pour le dossier ${inv.dossierNumero}.`
        : 'Invitation refusée.',
      invitation: updated,
    };
  }
}
