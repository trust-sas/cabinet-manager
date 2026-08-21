/**
 * backend/src/modules/notifications/notifications.service.ts
 * Service métier de gestion des notifications.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

export interface ResultatPagineNotifications {
  page: number;
  pageSize: number;
  total: number;
  nonLuesCount: number;
  data: Notification[];
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(dto: CreateNotificationDto, cabinetId: number): Promise<Notification> {
    const notif = this.notificationRepository.create({
      cabinetId,
      utilisateurId: dto.utilisateurId,
      titre: dto.titre,
      message: dto.message,
      type: dto.type,
      entiteType: dto.entiteType ?? null,
      entiteId: dto.entiteId ?? null,
      lu: false,
      createdAt: new Date(),
    });

    return this.notificationRepository.save(notif);
  }

  async findAllForUser(
    user: AuthenticatedUser,
    page = 1,
    pageSize = 20,
  ): Promise<ResultatPagineNotifications> {
    const qb = this.notificationRepository.createQueryBuilder('n')
      .where('n.utilisateurId = :userId', { userId: user.id })
      .orderBy('n.createdAt', 'DESC');

    const [data, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const nonLuesCount = await this.notificationRepository.count({
      where: { utilisateurId: user.id, lu: false },
    });

    return { page, pageSize, total, nonLuesCount, data };
  }

  async marquerCommeLue(id: number, user: AuthenticatedUser): Promise<Notification> {
    const notif = await this.notificationRepository.findOne({
      where: { id, utilisateurId: user.id },
    });

    if (!notif) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    notif.lu = true;
    return this.notificationRepository.save(notif);
  }

  async marquerToutCommeLu(user: AuthenticatedUser): Promise<{ count: number }> {
    const result = await this.notificationRepository.update(
      { utilisateurId: user.id, lu: false },
      { lu: true },
    );

    return { count: result.affected ?? 0 };
  }

  async compterNonLues(user: AuthenticatedUser): Promise<number> {
    return this.notificationRepository.count({
      where: { utilisateurId: user.id, lu: false },
    });
  }

  async supprimer(id: number, user: AuthenticatedUser): Promise<void> {
    const notif = await this.notificationRepository.findOne({
      where: { id, utilisateurId: user.id },
    });
    if (!notif) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }
    await this.notificationRepository.remove(notif);
  }
}
