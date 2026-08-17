/**
 * src/services/notifications.service.ts
 * API Frontend pour la gestion des notifications (audiences, factures, RDV).
 */

import api from '@/lib/api';

export type NotificationType =
  | 'audience_rappel'
  | 'facture_retard'
  | 'rdv_rappel'
  | 'info'
  | 'invitation'
  | 'permission_requete'
  | 'permission_reponse';

export interface NotificationItem {
  id: number;
  cabinetId: number;
  utilisateurId: number;
  titre: string;
  message: string;
  type: NotificationType;
  lu: boolean;
  entiteType?: string | null;
  entiteId?: number | null;
  createdAt: string;
}

export interface NotificationsPage {
  page: number;
  pageSize: number;
  total: number;
  nonLuesCount: number;
  data: NotificationItem[];
}

export async function getNotifications(page = 1, pageSize = 20): Promise<NotificationsPage> {
  const { data } = await api.get<NotificationsPage>('/notifications', {
    params: { page, pageSize },
  });
  return data;
}

export async function getUnreadNotificationsCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function marquerNotificationCommeLue(id: number): Promise<NotificationItem> {
  const { data } = await api.patch<NotificationItem>(`/notifications/${id}/lire`);
  return data;
}

export async function marquerToutesNotificationsCommeLues(): Promise<{ count: number }> {
  const { data } = await api.patch<{ count: number }>('/notifications/lire-tout');
  return data;
}

export async function supprimerNotification(id: number): Promise<void> {
  await api.delete(`/notifications/${id}`);
}
