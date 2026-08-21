import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audience } from './entities/audience.entity';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { QueryAudiencesDto } from './dto/query-audiences.dto';
import { JournalService } from '../journal/journal.service';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

import { Dossier } from '../dossiers/entities/dossier.entity';

export interface ResultatPagine<T> {
  page: number; pageSize: number; total: number; data: T[];
}

@Injectable()
export class AudiencesService {
  constructor(
    @InjectRepository(Audience)
    private readonly repo: Repository<Audience>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    private readonly journalService: JournalService,
  ) {}

  async create(dto: CreateAudienceDto, user: AuthenticatedUser): Promise<Audience> {
    let targetCabinetId = user.cabinetId;
    if (dto.dossierId) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossierId } });
      if (dossier) targetCabinetId = dossier.cabinetId;
    }

    const audience = this.repo.create({
      cabinetId: targetCabinetId,
      dossierId: dto.dossierId,
      dateAudience: new Date(dto.dateAudience),
      heure: dto.heure ?? null,
      juridiction: dto.juridiction ?? null,
      salle: dto.salle ?? null,
      typeAudience: dto.typeAudience ?? null,
      statut: dto.statut ?? 'prevue' as any,
      notes: dto.notes ?? null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const saved = await this.repo.save(audience);
    await this.journalService.enregistrer({
      cabinetId: targetCabinetId, utilisateurId: user.id,
      action: 'audience.create', entiteType: 'audience',
      entiteId: saved.id, donneesApres: { ...saved },
    });
    return saved;
  }

  async findAll(query: QueryAudiencesDto, user: AuthenticatedUser): Promise<ResultatPagine<Audience>> {
    const userEmailClean = user.email ? user.email.trim().toLowerCase() : '';
    const userPhoneClean = user.telephone ? user.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;

    const qb = this.repo.createQueryBuilder('a')
      .where('(a.cabinetId = :cabinetId OR a.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\') OR a.dossierId IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))', { cabinetId: user.cabinetId, userId: user.id, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix })
      .andWhere('a.deletedAt IS NULL');

    if (query.dossierId) qb.andWhere('a.dossierId = :dossierId', { dossierId: query.dossierId });
    if (query.statut)    qb.andWhere('a.statut = :statut', { statut: query.statut });
    if (query.dateDebut) qb.andWhere('a.dateAudience >= :dateDebut', { dateDebut: query.dateDebut });
    if (query.dateFin)   qb.andWhere('a.dateAudience <= :dateFin', { dateFin: query.dateFin });

    qb.orderBy('a.dateAudience', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { page: query.page, pageSize: query.pageSize, total, data };
  }

  async findOne(id: number, user: AuthenticatedUser): Promise<Audience> {
    const userEmailClean = user.email ? user.email.trim().toLowerCase() : '';
    const userPhoneClean = user.telephone ? user.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;

    const a = await this.repo.createQueryBuilder('a')
      .where('a.id = :id', { id })
      .andWhere('(a.cabinetId = :cabinetId OR a.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\') OR a.dossierId IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))', { cabinetId: user.cabinetId, userId: user.id, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix })
      .andWhere('a.deletedAt IS NULL')
      .getOne();

    if (!a) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Audience introuvable.', status: 404 } });
    return a;
  }

  async update(id: number, dto: UpdateAudienceDto, user: AuthenticatedUser): Promise<Audience> {
    const audience = await this.findOne(id, user);
    if (dto.versionConnue !== undefined && dto.versionConnue !== audience.version) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: `Version conflit (serveur: ${audience.version}).`, status: 409 } });
    }
    const avant = { ...audience };
    if (dto.dateAudience !== undefined) audience.dateAudience = new Date(dto.dateAudience);
    if (dto.heure         !== undefined) audience.heure         = dto.heure;
    if (dto.juridiction   !== undefined) audience.juridiction   = dto.juridiction;
    if (dto.salle         !== undefined) audience.salle         = dto.salle;
    if (dto.typeAudience  !== undefined) audience.typeAudience  = dto.typeAudience;
    if (dto.statut        !== undefined) audience.statut        = dto.statut;
    if (dto.notes         !== undefined) audience.notes         = dto.notes;
    const saved = await this.repo.save(audience);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'audience.update', entiteType: 'audience',
      entiteId: id, donneesAvant: avant, donneesApres: { ...saved },
    });
    return saved;
  }

  async remove(id: number, user: AuthenticatedUser): Promise<void> {
    const audience = await this.findOne(id, user);
    audience.deletedAt = new Date();
    await this.repo.save(audience);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'audience.delete', entiteType: 'audience',
      entiteId: id, donneesAvant: { ...audience },
    });
  }
}
