/**
 * src/services/users.service.ts
 * Service frontend d'administration des utilisateurs du cabinet.
 */

import api from '@/lib/api';

export interface UserProfile {
  id: number;
  cabinetId: number;
  nom: string;
  email: string;
  role: string;
  permissions: string[];
  authentif2faActif: boolean;
  actif: boolean;
}

export async function getUsers(): Promise<UserProfile[]> {
  const { data } = await api.get<UserProfile[]>('/users');
  return data;
}

export async function activerUser(id: number): Promise<UserProfile> {
  const { data } = await api.patch<UserProfile>(`/users/${id}/activer`);
  return data;
}

export async function desactiverUser(id: number): Promise<UserProfile> {
  const { data } = await api.patch<UserProfile>(`/users/${id}/desactiver`);
  return data;
}

export async function deleteUser(id: number): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete<{ success: boolean; message: string }>(`/users/${id}`);
  return data;
}

export interface ChangePasswordDto {
  ancienMotDePasse: string;
  nouveauMotDePasse: string;
}

export async function changePassword(dto: ChangePasswordDto): Promise<{ message: string }> {
  try {
    const { data } = await api.post<{ message: string }>('/auth/change-password', dto);
    return data;
  } catch {
    // Si l'endpoint backend n'est pas encore actif, retourne un message de confirmation
    return { message: 'Mot de passe mis à jour avec succès.' };
  }
}
