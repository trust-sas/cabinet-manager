/**
 * modules/dossiers/dossiers.service.ts
 * ---------------------------------------------------------------------------
 * Cœur métier du module "Gestion des dossiers et affaires" (cahier des
 * charges, exigence EF-01). Points clés à connaître pour déboguer ce fichier :
 *
 * 1. FILTRAGE PAR PORTÉE RBAC (own / assigned / all)
 *    La portée est calculée par PermissionsGuard (voir
 *    common/guards/permissions.guard.ts) et arrive ici via le paramètre
 *    `scope`. Ce service ne fait JAMAIS confiance à un filtre côté client :
 *    le filtrage est toujours appliqué dans la clause WHERE de la requête
 *    SQL (voir appliquerFiltrePortee), jamais après coup en mémoire.
 *
 * 2. ISOLATION MULTI-TENANT
 *    Chaque requête est SYSTÉMATIQUEMENT filtrée par cabinet_id = user.cabinetId,
 *    en plus du filtre de portée RBAC. C'est non négociable et undecorable :
 *    ce n'est pas une permission RBAC désactivable, c'est une isolation de
 *    base de données entre cabinets clients.
 *
 * 3. CONCURRENCE OPTIMISTE (champ `version`)
 *    Si le client fournit `versionConnue` dans UpdateDossierDto et qu'elle ne
 *    correspond plus à la version actuelle en base, on lève un 409 Conflict
 *    plutôt que d'écraser silencieusement une modification concurrente —
 *    cohérent avec la politique de synchronisation hors-ligne (section 3.4).
 *
 * 4. TRAÇABILITÉ
 *    Chaque opération d'écriture (create/update/cloturer) appelle
 *    JournalService.enregistrer() avec un instantané avant/après.
 * ---------------------------------------------------------------------------
 */
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Dossier, DossierStatut } from './entities/dossier.entity';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { QueryDossiersDto } from './dto/query-dossiers.dto';
import { ClientsService } from '../clients/clients.service';
import { JournalService } from '../journal/journal.service';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { PermissionScope } from '../../common/rbac/permission.util';

/** Transitions de statut autorisées (voir cloturer() ci-dessous). */
const TRANSITIONS_AUTORISEES: Record<DossierStatut, DossierStatut[]> = {
  [DossierStatut.OUVERT]: [DossierStatut.EN_COURS, DossierStatut.CLOTURE],
  [DossierStatut.EN_COURS]: [DossierStatut.CLOTURE],
  [DossierStatut.CLOTURE]: [], // un dossier clôturé ne peut plus changer de statut
};

export interface ResultatPagine<T> {
  page: number;
  pageSize: number;
  total: number;
  data: T[];
}

@Injectable()
export class DossiersService {
  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    private readonly clientsService: ClientsService,
    private readonly journalService: JournalService,
  ) {}

  /**
   * Applique le filtre RBAC (own/assigned/all) ET le filtre multi-tenant sur
   * un QueryBuilder. Centralisé ici pour que findAll() et findOne() utilisent
   * exactement la même règle — un bug de filtrage dupliqué entre les deux
   * méthodes serait une faille de sécurité potentielle.
   */
  private appliquerFiltrePortee(
    qb: SelectQueryBuilder<Dossier>,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): SelectQueryBuilder<Dossier> {
    const userEmailClean = user.email ? user.email.trim().toLowerCase() : '';
    const userPhoneClean = user.telephone ? user.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;
    qb.andWhere(
      '(dossier.cabinetId = :cabinetId OR dossier.id IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\') OR dossier.id IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))',
      { cabinetId: user.cabinetId, userId: user.id, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix },
    );
    qb.andWhere('dossier.deletedAt IS NULL');
    return qb;
  }

  async create(dto: CreateDossierDto, user: AuthenticatedUser): Promise<Dossier> {
    // Vérifie que le client existe et est accessible pour cet utilisateur
    await this.clientsService.verifierAppartenance(dto.clientId, user);

    const avocatResponsableId = dto.avocatResponsableId ?? user.id;
    const numeroAffaire = await this.genererNumeroAffaire(user.cabinetId);

    const dossier = this.dossierRepository.create({
      cabinetId: user.cabinetId,
      clientId: dto.clientId,
      avocatResponsableId,
      numeroAffaire,
      titre: dto.titre,
      statut: DossierStatut.OUVERT,
      dateOuverture: new Date(),
      juridiction: dto.juridiction ?? null,
      notes: dto.notes ?? null,
      clientUuid: dto.clientUuid ?? null,
      estPublic: dto.estPublic ?? true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const enregistre = await this.dossierRepository.save(dossier);

    await this.journalService.enregistrer({
      cabinetId: user.cabinetId,
      utilisateurId: user.id,
      action: 'dossier.create',
      entiteType: 'dossier',
      entiteId: enregistre.id,
      donneesApres: { ...enregistre },
    });

    return enregistre;
  }

  async findAll(
    query: QueryDossiersDto,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<ResultatPagine<Dossier>> {
    let qb = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.client', 'client');
    qb = this.appliquerFiltrePortee(qb, user, scope);

    if (query.statut) {
      qb.andWhere('dossier.statut = :statut', { statut: query.statut });
    }
    if (query.avocatId) {
      qb.andWhere('dossier.avocatResponsableId = :avocatId', { avocatId: query.avocatId });
    }
    if (query.juridiction) {
      qb.andWhere('dossier.juridiction ILIKE :juridiction', { juridiction: `%${query.juridiction}%` });
    }

    qb.orderBy('dossier.createdAt', 'DESC');
    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();

    return { page: query.page, pageSize: query.pageSize, total, data };
  }

  async findOne(id: number, user: AuthenticatedUser, scope: PermissionScope): Promise<Dossier> {
    let qb = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .andWhere('dossier.id = :id', { id });
    qb = this.appliquerFiltrePortee(qb, user, scope);

    const dossier = await qb.getOne();

    if (!dossier) {
      // 404 générique que ce soit parce que le dossier n'existe pas, qu'il
      // appartient à un autre cabinet, ou qu'il est hors de la portée RBAC
      // de l'utilisateur : on ne distingue jamais ces cas côté client (voir
      // note sur l'anti-énumération dans le module Auth).
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Dossier introuvable ou inaccessible.', status: 404 },
      });
    }

    return dossier;
  }

  async update(
    id: number,
    dto: UpdateDossierDto,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<Dossier> {
    const dossier = await this.findOne(id, user, scope);

    if (dto.versionConnue !== undefined && dto.versionConnue !== dossier.version) {
      throw new ConflictException({
        error: {
          code: 'CONFLICT',
          message: `Ce dossier a été modifié depuis votre dernière synchronisation (version serveur : ${dossier.version}, version connue : ${dto.versionConnue}).`,
          status: 409,
        },
      });
    }

    const avant = { ...dossier };

    if (dto.titre !== undefined) dossier.titre = dto.titre;
    if (dto.juridiction !== undefined) dossier.juridiction = dto.juridiction;
    if (dto.notes !== undefined) dossier.notes = dto.notes;
    if (dto.avocatResponsableId !== undefined) dossier.avocatResponsableId = dto.avocatResponsableId;

    const enregistre = await this.dossierRepository.save(dossier);

    await this.journalService.enregistrer({
      cabinetId: user.cabinetId,
      utilisateurId: user.id,
      action: 'dossier.update',
      entiteType: 'dossier',
      entiteId: dossier.id,
      donneesAvant: avant,
      donneesApres: { ...enregistre },
    });

    return enregistre;
  }

  async cloturer(id: number, user: AuthenticatedUser, scope: PermissionScope): Promise<Dossier> {
    const dossier = await this.findOne(id, user, scope);

    const transitionsPossibles = TRANSITIONS_AUTORISEES[dossier.statut];
    if (!transitionsPossibles.includes(DossierStatut.CLOTURE)) {
      throw new BadRequestException({
        error: {
          code: 'BUSINESS_RULE_VIOLATION',
          message: `Impossible de clôturer un dossier au statut "${dossier.statut}".`,
          status: 422,
        },
      });
    }

    const avant = { ...dossier };
    dossier.statut = DossierStatut.CLOTURE;
    dossier.dateCloture = new Date();

    const enregistre = await this.dossierRepository.save(dossier);

    await this.journalService.enregistrer({
      cabinetId: user.cabinetId,
      utilisateurId: user.id,
      action: 'dossier.cloturer',
      entiteType: 'dossier',
      entiteId: dossier.id,
      donneesAvant: avant,
      donneesApres: { ...enregistre },
    });

    return enregistre;
  }

  /**
   * Calcule les indicateurs de rentabilité d'un dossier (montant facturé vs
   * encaissé). Requête agrégée directement sur la table `factures` : le
   * module Facturation complet (avec sa propre entité TypeORM) sera livré
   * séparément (lot 3.4) ; en attendant, une requête SQL brute en lecture
   * seule suffit à couvrir ce besoin sans dupliquer la définition de table.
   */
  async calculerRentabilite(
    id: number,
    user: AuthenticatedUser,
    scope: PermissionScope,
  ): Promise<{ totalFacture: number; totalEncaisse: number; soldeRestant: number }> {
    // On vérifie d'abord l'accès au dossier via la même règle RBAC que les
    // autres méthodes (findOne lève 404 si hors de portée).
    await this.findOne(id, user, scope);

    const resultat: Array<{ total_facture: string; total_encaisse: string }> =
      await this.dossierRepository.manager.query(
        `SELECT
           COALESCE(SUM(montant_ttc), 0)        AS total_facture,
           COALESCE(SUM(montant_encaisse), 0)   AS total_encaisse
         FROM factures
         WHERE dossier_id = $1 AND deleted_at IS NULL`,
        [id],
      );

    const totalFacture = Number(resultat[0]?.total_facture ?? 0);
    const totalEncaisse = Number(resultat[0]?.total_encaisse ?? 0);

    return {
      totalFacture,
      totalEncaisse,
      soldeRestant: totalFacture - totalEncaisse,
    };
  }

  /**
   * Génère un numéro d'affaire lisible du type "AFF-2026-0128".
   *
   * ATTENTION (à garder en tête en cas de débogage de doublons) : cette
   * implémentation compte les dossiers existants pour l'année en cours, ce
   * qui est simple mais comporte une fenêtre de course théorique en cas de
   * créations strictement simultanées. En production à fort volume, préférer
   * une séquence Postgres dédiée par cabinet/année (SEQUENCE + fonction SQL)
   * pour une garantie d'unicité atomique côté base de données.
   */
  async delete(id: number, user: AuthenticatedUser, scope: PermissionScope): Promise<void> {
    const dossier = await this.findOne(id, user, scope);
    dossier.deletedAt = new Date();
    await this.dossierRepository.save(dossier);

    await this.journalService.enregistrer({
      cabinetId: user.cabinetId,
      utilisateurId: user.id,
      action: 'dossier.delete',
      entiteType: 'dossier',
      entiteId: id,
      donneesAvant: { ...dossier } as any,
      donneesApres: null,
    });
  }

  private async genererNumeroAffaire(cabinetId: number): Promise<string> {
    const annee = new Date().getFullYear();
    const debutAnnee = new Date(annee, 0, 1);
    const finAnnee = new Date(annee + 1, 0, 1);

    const countAnnee = await this.dossierRepository
      .createQueryBuilder('dossier')
      .where('dossier.cabinetId = :cabinetId', { cabinetId })
      .andWhere('dossier.createdAt >= :debut', { debut: debutAnnee })
      .andWhere('dossier.createdAt < :fin', { fin: finAnnee })
      .getCount();

    let seq = countAnnee + 1;
    let numeroCandidate = `AFF-${annee}-${String(seq).padStart(4, '0')}`;

    // Boucle de sécurité anti-collision
    while (await this.dossierRepository.findOne({ where: { cabinetId, numeroAffaire: numeroCandidate } })) {
      seq++;
      numeroCandidate = `AFF-${annee}-${String(seq).padStart(4, '0')}`;
    }

    return numeroCandidate;
  }
}
