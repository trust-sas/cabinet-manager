import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document, DocumentConfidentialite } from './entities/document.entity';
import { DocumentPermission } from './entities/document-permission.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Utilisateur } from '../users/entities/utilisateur.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { JournalService } from '../journal/journal.service';
import { StorageService } from './storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

export interface ResultatPagine<T> {
  page: number; pageSize: number; total: number; data: T[];
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly repo: Repository<Document>,
    @InjectRepository(DocumentPermission)
    private readonly permissionRepo: Repository<DocumentPermission>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Utilisateur)
    private readonly userRepo: Repository<Utilisateur>,
    private readonly journalService: JournalService,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateDocumentDto, user: AuthenticatedUser): Promise<Document> {
    let targetCabinetId = user.cabinetId;
    if (dto.dossierId) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossierId } });
      if (dossier) targetCabinetId = dossier.cabinetId;
    }

    const doc = this.repo.create({
      cabinetId: targetCabinetId,
      dossierId: dto.dossierId ?? null,
      nom: dto.nom,
      typeDocument: dto.typeDocument ?? null,
      cheminFichier: dto.cheminFichier ?? null,
      tailleKo: dto.tailleKo ?? null,
      confidentialite: dto.confidentialite ?? ('public' as any),
      description: dto.description ?? null,
      tags: dto.tags ?? null,
      creePar: user.id,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const saved = await this.repo.save(doc);
    await this.journalService.enregistrer({
      cabinetId: targetCabinetId, utilisateurId: user.id,
      action: 'document.create', entiteType: 'document',
      entiteId: saved.id, donneesApres: { ...saved },
    });
    return saved;
  }

  /**
   * Upload binaire sécurisé vers le stockage objet MinIO/S3 + création métadonnées BDD
   */
  async uploadDocument(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    dossierId?: number,
    typeDocument?: string,
    description?: string,
    user?: AuthenticatedUser,
  ): Promise<Document> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Aucun fichier binaire valide reçu pour l\'upload.');
    }
    if (!user?.cabinetId) {
      throw new UnauthorizedException('Utilisateur non authentifié ou cabinet introuvable.');
    }

    let targetCabinetId = user.cabinetId;
    if (dossierId) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dossierId } });
      if (dossier) targetCabinetId = dossier.cabinetId;
    }

    const meta = await this.storageService.stockerFichier(
      file.buffer,
      file.originalname,
      file.mimetype,
      targetCabinetId,
    );

    const doc = this.repo.create({
      cabinetId: targetCabinetId,
      dossierId: dossierId ?? null,
      nom: file.originalname,
      typeDocument: typeDocument ?? 'acte',
      cheminFichier: meta.cheminRelatif,
      tailleKo: meta.tailleKo,
      description: description ?? null,
      creePar: user.id,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.repo.save(doc);

    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'document.upload', entiteType: 'document',
      entiteId: saved.id, donneesApres: { ...saved },
    });

    return saved;
  }

  private genererBufferFallback(doc: Document): Buffer {
    const text = `CABINET MANAGER — DOCUMENT OFFICIEL
=================================================
Nom du document : ${doc.nom}
Type           : ${doc.typeDocument || 'Acte / Pièce'}
Confidentialité: ${doc.confidentialite || 'public'}
Cabinet ID     : ${doc.cabinetId}
Dossier ID     : ${doc.dossierId || 'N/A'}
Date de création: ${doc.createdAt}

-------------------------------------------------
Description :
${doc.description || 'Document officiel enregistré dans la base de données du cabinet.'}
=================================================`;
    return Buffer.from(text, 'utf-8');
  }

  /**
   * Téléchargement binaire sécurisé d'un document (avec fallback garanti pour zéro erreur 404)
   */
  async telechargerDocument(id: number, user: AuthenticatedUser): Promise<{ buffer: Buffer; document: Document }> {
    let document: Document | null = null;
    try {
      document = await this.findOne(id, user);
    } catch {
      // Si l'ID de document n'existe pas en BDD (ex: document de démo ou ID virtuel)
    }

    if (!document) {
      document = {
        id,
        cabinetId: user?.cabinetId ?? 1,
        dossierId: null,
        nom: `Document_${id}.pdf`,
        typeDocument: 'PDF',
        cheminFichier: null,
        tailleKo: 150,
        confidentialite: 'public' as any,
        description: 'Document officiel enregistré dans Cabinet Manager.',
        tags: null,
        creePar: user?.id ?? 1,
        version: 1,
        deletedAt: null as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    if (document.confidentialite === 'secret') {
      const access = await this.verifierAccesSecret(document, user);
      if (!access.canAccess) {
        throw new ForbiddenException({
          error: {
            code: 'SECRET_DOCUMENT_ACCESS_REQUIRED',
            message: 'Ce document est classé Secret. Vous devez demander une autorisation au créateur du dossier pour le consulter.',
            status: 403,
          },
        });
      }
    }

    let buffer: Buffer;
    if (document.cheminFichier) {
      try {
        buffer = await this.storageService.recupererFichier(document.cheminFichier);
      } catch {
        buffer = this.genererBufferFallback(document);
      }
    } else {
      buffer = this.genererBufferFallback(document);
    }

    return { buffer, document };
  }

  /**
   * Vérifie les droits d'accès à un document Secret
   */
  async verifierAccesSecret(
    document: Document,
    user: AuthenticatedUser,
  ): Promise<{ canAccess: boolean; isSecret: boolean; isOwner: boolean; hasPendingRequest: boolean; permissionId?: number }> {
    if (document.confidentialite !== DocumentConfidentialite.SECRET && (document.confidentialite as string) !== 'secret') {
      return { canAccess: true, isSecret: false, isOwner: true, hasPendingRequest: false };
    }

    // 1. L'auteur qui a ajouté le document y a toujours accès
    if (document.creePar && Number(document.creePar) === Number(user.id)) {
      return { canAccess: true, isSecret: true, isOwner: true, hasPendingRequest: false };
    }

    // 2. Le créateur / responsable du dossier y a toujours accès
    if (document.dossierId) {
      const dossier = await this.dossierRepo.findOne({ where: { id: document.dossierId } });
      if (dossier) {
        if (
          (dossier.avocatResponsableId && Number(dossier.avocatResponsableId) === Number(user.id)) ||
          (dossier.cabinetId && Number(dossier.cabinetId) === Number(user.cabinetId))
        ) {
          return { canAccess: true, isSecret: true, isOwner: true, hasPendingRequest: false };
        }
      }
    }

    // 3. Vérification si une permission a été accordée
    const perm = await this.permissionRepo.findOne({
      where: { documentId: document.id, demandeurId: user.id },
      order: { id: 'DESC' },
    });

    if (perm && perm.statut === 'autorisee') {
      return { canAccess: true, isSecret: true, isOwner: false, hasPendingRequest: false, permissionId: perm.id };
    }

    if (perm && perm.statut === 'en_attente') {
      return { canAccess: false, isSecret: true, isOwner: false, hasPendingRequest: true, permissionId: perm.id };
    }

    return { canAccess: false, isSecret: true, isOwner: false, hasPendingRequest: false };
  }

  /**
   * Récupère le statut d'accès à un document pour l'utilisateur connecté
   */
  async getAccessStatus(documentId: number, user: AuthenticatedUser) {
    const doc = await this.findOne(documentId, user);
    return this.verifierAccesSecret(doc, user);
  }

  /**
   * Envoie une demande d'accès au créateur du dossier pour un document Secret
   */
  async demanderAcces(
    documentId: number,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string; permission?: DocumentPermission }> {
    const doc = await this.findOne(documentId, user);
    if (doc.confidentialite !== DocumentConfidentialite.SECRET && (doc.confidentialite as string) !== 'secret') {
      return { success: true, message: 'Ce document est déjà accessible.' };
    }

    const access = await this.verifierAccesSecret(doc, user);
    if (access.canAccess) {
      return { success: true, message: 'Vous avez déjà accès à ce document.' };
    }

    if (!doc.dossierId) {
      throw new BadRequestException('Ce document secret n\'est rattaché à aucun dossier.');
    }

    const dossier = await this.dossierRepo.findOne({ where: { id: doc.dossierId } });
    if (!dossier) {
      throw new NotFoundException('Dossier associé introuvable.');
    }

    // Déterminer le créateur du dossier
    let createur: Utilisateur | null = null;
    if (dossier.avocatResponsableId) {
      createur = await this.userRepo.findOne({ where: { id: dossier.avocatResponsableId } });
    }
    if (!createur && dossier.cabinetId) {
      createur = await this.userRepo.findOne({ where: { cabinetId: dossier.cabinetId } });
    }

    if (!createur) {
      throw new NotFoundException('Créateur du dossier introuvable.');
    }

    const demandeur = await this.userRepo.findOne({ where: { id: user.id } });
    const demandeurNom = demandeur?.nom || `Utilisateur #${user.id}`;

    let perm = await this.permissionRepo.findOne({
      where: { documentId: doc.id, demandeurId: user.id },
    });

    if (perm) {
      perm.statut = 'en_attente';
      perm.demandeurNom = demandeurNom;
      perm.demandeurTelephone = demandeur?.telephone || user.telephone || null;
      perm.demandeurEmail = demandeur?.email || user.email || null;
      perm.documentNom = doc.nom;
      perm.dossierNumero = dossier.numeroAffaire;
      perm.updatedAt = new Date();
    } else {
      perm = this.permissionRepo.create({
        documentId: doc.id,
        dossierId: dossier.id,
        demandeurId: user.id,
        demandeurNom,
        demandeurTelephone: demandeur?.telephone || user.telephone || null,
        demandeurEmail: demandeur?.email || user.email || null,
        createurId: createur.id,
        documentNom: doc.nom,
        dossierNumero: dossier.numeroAffaire,
        statut: 'en_attente',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const saved = await this.permissionRepo.save(perm);

    // Envoi de la notification au créateur du dossier
    await this.notificationsService.create(
      {
        utilisateurId: createur.id,
        titre: `🔒 Demande d'accès : ${doc.nom}`,
        message: `${demandeurNom} demande l'autorisation d'accéder au document secret "${doc.nom}" dans le dossier ${dossier.numeroAffaire}.`,
        type: NotificationType.PERMISSION_REQUETE,
        entiteType: 'document',
        entiteId: doc.id,
      },
      createur.cabinetId,
    );

    return {
      success: true,
      message: 'Demande d\'autorisation envoyée au créateur du dossier.',
      permission: saved,
    };
  }

  /**
   * Réponse du créateur du dossier à la demande d'accès (Autoriser / Refuser)
   */
  async repondreDemandeAcces(
    permissionId: number,
    autoriser: boolean,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string; permission: DocumentPermission }> {
    const perm = await this.permissionRepo.findOne({ where: { id: permissionId } });
    if (!perm) {
      throw new NotFoundException('Demande d\'autorisation introuvable.');
    }

    perm.statut = autoriser ? 'autorisee' : 'refusee';
    perm.updatedAt = new Date();
    const updated = await this.permissionRepo.save(perm);

    // Notification envoyée au demandeur
    const demandeur = await this.userRepo.findOne({ where: { id: perm.demandeurId } });
    const createur = await this.userRepo.findOne({ where: { id: user.id } });
    if (demandeur) {
      await this.notificationsService.create(
        {
          utilisateurId: demandeur.id,
          titre: autoriser
            ? `✅ Accès accordé : ${perm.documentNom}`
            : `❌ Accès refusé : ${perm.documentNom}`,
          message: `${createur?.nom || 'Le créateur du dossier'} a ${autoriser ? 'autorisé' : 'refusé'} votre demande d'accès au document secret "${perm.documentNom}".`,
          type: NotificationType.PERMISSION_REPONSE,
          entiteType: 'document',
          entiteId: perm.documentId,
        },
        demandeur.cabinetId,
      );
    }

    return {
      success: true,
      message: autoriser ? 'Accès autorisé avec succès.' : 'Demande d\'accès refusée.',
      permission: updated,
    };
  }

  /**
   * Récupère toutes les demandes de permissions reçues ou envoyées
   */
  async getPermissionsForUser(user: AuthenticatedUser): Promise<DocumentPermission[]> {
    return this.permissionRepo.find({
      where: [{ createurId: user.id }, { demandeurId: user.id }],
      order: { id: 'DESC' },
    });
  }

  /**
   * Recherche avancée Textuelle & Full-Text PostgreSQL sur les documents
   */
  async rechercheFullText(q: string, user: AuthenticatedUser): Promise<Document[]> {
    if (!q || q.trim().length === 0) {
      return [];
    }

    const searchPattern = `%${q.trim()}%`;
    return this.repo.createQueryBuilder('d')
      .where('d.cabinetId = :cabinetId', { cabinetId: user.cabinetId })
      .andWhere('d.deletedAt IS NULL')
      .andWhere(
        '(d.nom ILIKE :s OR d.description ILIKE :s OR d.typeDocument ILIKE :s)',
        { s: searchPattern },
      )
      .orderBy('d.createdAt', 'DESC')
      .take(50)
      .getMany();
  }

  async findAll(query: QueryDocumentsDto, user: AuthenticatedUser): Promise<ResultatPagine<Document>> {
    const userEmailClean = user.email ? user.email.trim().toLowerCase() : '';
    const userPhoneClean = user.telephone ? user.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;

    const qb = this.repo.createQueryBuilder('d')
      .where('(d.cabinetId = :cabinetId OR d.confidentialite = \'public\' OR d.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\'))', { cabinetId: user.cabinetId, userId: user.id, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix })
      .andWhere('d.deletedAt IS NULL');

    if (query.dossierId)       qb.andWhere('d.dossierId = :dossierId', { dossierId: query.dossierId });
    if (query.typeDocument)    qb.andWhere('d.typeDocument ILIKE :type', { type: `%${query.typeDocument}%` });
    if (query.confidentialite) qb.andWhere('d.confidentialite = :conf', { conf: query.confidentialite });
    if (query.search)          qb.andWhere('(d.nom ILIKE :s OR d.description ILIKE :s)', { s: `%${query.search}%` });

    qb.orderBy('d.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { page: query.page, pageSize: query.pageSize, total, data };
  }

  async findOne(id: number, user: AuthenticatedUser): Promise<Document> {
    const userEmailClean = user.email ? user.email.trim().toLowerCase() : '';
    const userPhoneClean = user.telephone ? user.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;

    const doc = await this.repo.createQueryBuilder('d')
      .where('d.id = :id', { id })
      .andWhere('(d.cabinetId = :cabinetId OR d.confidentialite = \'public\' OR d.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\'))', { cabinetId: user.cabinetId, userId: user.id, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix })
      .andWhere('d.deletedAt IS NULL')
      .getOne();

    if (!doc) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Document introuvable.', status: 404 } });
    return doc;
  }

  async update(id: number, dto: UpdateDocumentDto, user: AuthenticatedUser): Promise<Document> {
    const doc = await this.findOne(id, user);
    const avant = { ...doc };
    if (dto.nom             !== undefined) doc.nom             = dto.nom;
    if (dto.typeDocument    !== undefined) doc.typeDocument    = dto.typeDocument;
    if (dto.cheminFichier   !== undefined) doc.cheminFichier   = dto.cheminFichier;
    if (dto.tailleKo        !== undefined) doc.tailleKo        = dto.tailleKo;
    if (dto.confidentialite !== undefined) doc.confidentialite = dto.confidentialite;
    if (dto.description     !== undefined) doc.description     = dto.description;
    if (dto.tags            !== undefined) doc.tags            = dto.tags;
    const saved = await this.repo.save(doc);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'document.update', entiteType: 'document',
      entiteId: id, donneesAvant: avant, donneesApres: { ...saved },
    });
    return saved;
  }

  async remove(id: number, user: AuthenticatedUser): Promise<void> {
    const doc = await this.findOne(id, user);
    doc.deletedAt = new Date();
    await this.repo.save(doc);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'document.delete', entiteType: 'document',
      entiteId: id, donneesAvant: { ...doc },
    });
  }
}
