/**
 * backend/src/modules/clients/clients.service.ts
 * Service complet de gestion des clients multi-tenant.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Like, Repository } from 'typeorm';
import { Client } from './entities/client.entity';

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

  async verifierAppartenance(clientId: number, cabinetId: number): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId, cabinetId, deletedAt: IsNull() },
    });

    if (!client) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Client introuvable ou inaccessible.', status: 404 },
      });
    }

    return client;
  }

  async findAll(query: QueryClientsDto, cabinetId: number, userEmail?: string) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const userEmailClean = userEmail ? userEmail.trim().toLowerCase() : '';

    const qb = this.clientRepository.createQueryBuilder('c')
      .where('(c.cabinetId = :cabinetId OR c.id IN (SELECT client_id FROM dossiers WHERE id IN (SELECT dossier_id FROM dossier_invitations WHERE LOWER(destinataire_email) = :userEmail AND statut = \'acceptee\')))', { cabinetId, userEmail: userEmailClean })
      .andWhere('c.deletedAt IS NULL');

    if (query.search) {
      qb.andWhere('c.nomComplet ILIKE :search', { search: `%${query.search.trim()}%` });
    }

    qb.orderBy('c.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();

    return { page, pageSize, total, data };
  }

  async findOne(id: number, cabinetId: number): Promise<Client> {
    return this.verifierAppartenance(id, cabinetId);
  }

  async create(dto: CreateClientDto, cabinetId: number): Promise<Client> {
    const client = this.clientRepository.create({
      cabinetId,
      nomComplet: dto.nomComplet.trim(),
      telephone: dto.telephone?.trim() ?? null,
      email: dto.email?.trim().toLowerCase() ?? null,
      version: 1,
      deletedAt: null,
    });

    return this.clientRepository.save(client);
  }

  async update(id: number, dto: UpdateClientDto, cabinetId: number): Promise<Client> {
    const client = await this.verifierAppartenance(id, cabinetId);

    if (dto.nomComplet !== undefined) client.nomComplet = dto.nomComplet.trim();
    if (dto.telephone !== undefined) client.telephone = dto.telephone.trim() || null;
    if (dto.email !== undefined) client.email = dto.email.trim().toLowerCase() || null;
    client.version += 1;

    return this.clientRepository.save(client);
  }

  async delete(id: number, cabinetId: number): Promise<void> {
    const client = await this.verifierAppartenance(id, cabinetId);
    client.deletedAt = new Date();
    await this.clientRepository.save(client);
  }
}
