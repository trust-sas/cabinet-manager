/**
 * backend/src/modules/clients/clients.service.ts
 * Service complet de gestion des clients multi-tenant.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Like, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

export interface CreateClientDto {
  nomComplet: string;
  telephone?: string;
  email?: string;
}

export interface UpdateClientDto {
  nomComplet?: string;
  telephone?: string;
  email?: string;
}

export interface QueryClientsDto {
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async verifierAppartenance(clientId: number, userOrCabinetId?: number | AuthenticatedUser): Promise<Client> {
    const cabinetId = typeof userOrCabinetId === 'number' ? userOrCabinetId : userOrCabinetId?.cabinetId;
    const userEmailClean = typeof userOrCabinetId === 'object' && userOrCabinetId.email ? userOrCabinetId.email.trim().toLowerCase() : '';
    const userPhoneClean = typeof userOrCabinetId === 'object' && userOrCabinetId.telephone ? userOrCabinetId.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;
    const userId = typeof userOrCabinetId === 'object' ? userOrCabinetId.id : 0;

    // 1. Vérification avec filtre de cabinet / invitations
    let client = await this.clientRepository.createQueryBuilder('c')
      .where('c.id = :clientId', { clientId })
      .andWhere(
        '(c.cabinetId = :cabinetId OR c.id IN (SELECT client_id FROM dossiers WHERE id IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\')))',
        { cabinetId, userId, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix },
      )
      .andWhere('c.deletedAt IS NULL')
      .getOne();

    // 2. Si non trouvé par le filtre restreint mais présent en base, l'autoriser pour la création de dossier
    if (!client) {
      client = await this.clientRepository.findOne({
        where: { id: clientId, deletedAt: IsNull() },
      });
    }

    if (!client) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Client introuvable ou inaccessible.', status: 404 },
      });
    }

    return client;
  }

  async findAll(query: QueryClientsDto, userOrCabinetId: number | AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const cabinetId = typeof userOrCabinetId === 'number' ? userOrCabinetId : userOrCabinetId.cabinetId;
    const userId = typeof userOrCabinetId === 'object' ? userOrCabinetId.id : 0;
    const userEmailClean = typeof userOrCabinetId === 'object' && userOrCabinetId.email ? userOrCabinetId.email.trim().toLowerCase() : '';
    const userPhoneClean = typeof userOrCabinetId === 'object' && userOrCabinetId.telephone ? userOrCabinetId.telephone.trim().replace(/\s+/g, '') : '';
    const userPhoneSuffix = userPhoneClean.length >= 8 ? userPhoneClean.slice(-8) : userPhoneClean;

    const qb = this.clientRepository.createQueryBuilder('c')
      .where(
        '(c.cabinetId = :cabinetId OR c.id IN (SELECT client_id FROM dossiers WHERE id IN (SELECT dossier_id FROM dossier_invitations WHERE (destinataire_id = :userId OR (LOWER(destinataire_email) = :userEmail AND :userEmail != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') = :userPhone AND :userPhone != \'\') OR (REPLACE(destinataire_telephone, \' \', \'\') LIKE \'%\' || :userPhoneSuffix AND :userPhoneSuffix != \'\')) AND statut = \'acceptee\')))',
        { cabinetId, userId, userEmail: userEmailClean, userPhone: userPhoneClean, userPhoneSuffix },
      )
      .andWhere('c.deletedAt IS NULL');

    if (query.search) {
      qb.andWhere('c.nomComplet ILIKE :search', { search: `%${query.search.trim()}%` });
    }

    qb.orderBy('c.id', 'DESC')
      .distinct(true)
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();

    return { page, pageSize, total, data };
  }

  async findOne(id: number, userOrCabinetId: number | AuthenticatedUser): Promise<Client> {
    return this.verifierAppartenance(id, userOrCabinetId);
  }

  async create(dto: CreateClientDto, cabinetId: number): Promise<Client> {
    const nomCompletClean = dto.nomComplet.trim();
    // Prevent duplicate clients with identical name within the same cabinet
    const existing = await this.clientRepository.createQueryBuilder('c')
      .where('c.cabinetId = :cabinetId', { cabinetId })
      .andWhere('LOWER(TRIM(c.nomComplet)) = LOWER(:nomComplet)', { nomComplet: nomCompletClean })
      .andWhere('c.deletedAt IS NULL')
      .getOne();

    if (existing) {
      let modified = false;
      if (dto.telephone?.trim() && !existing.telephone) {
        existing.telephone = dto.telephone.trim();
        modified = true;
      }
      if (dto.email?.trim() && !existing.email) {
        existing.email = dto.email.trim().toLowerCase();
        modified = true;
      }
      if (modified) {
        return this.clientRepository.save(existing);
      }
      return existing;
    }

    const client = this.clientRepository.create({
      cabinetId,
      nomComplet: nomCompletClean,
      telephone: dto.telephone?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      version: 1,
      deletedAt: null,
    });

    return this.clientRepository.save(client);
  }

  async update(id: number, dto: UpdateClientDto, userOrCabinetId: number | AuthenticatedUser): Promise<Client> {
    const client = await this.verifierAppartenance(id, userOrCabinetId);

    if (dto.nomComplet !== undefined) client.nomComplet = dto.nomComplet.trim();
    if (dto.telephone !== undefined) client.telephone = dto.telephone.trim() || null;
    if (dto.email !== undefined) client.email = dto.email.trim().toLowerCase() || null;
    client.version += 1;

    return this.clientRepository.save(client);
  }

  async delete(id: number, userOrCabinetId: number | AuthenticatedUser): Promise<void> {
    const client = await this.verifierAppartenance(id, userOrCabinetId);
    client.deletedAt = new Date();
    await this.clientRepository.save(client);
  }
}
