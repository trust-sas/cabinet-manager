/**
 * src/services/dossiers.service.ts
 * Fonctions API pour la gestion des dossiers (affaires).
 * Miroir côté frontend des endpoints exposés par DossiersController.
 */

import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DossierStatut = 'Ouvert' | 'En cours' | 'Cloture';

export interface DossierClient {
  id: number;
  nomComplet: string;
  telephone: string;
  email: string;
}

export interface Dossier {
  id: number;
  cabinetId: number;
  clientId: number;
  client?: DossierClient;
  avocatResponsableId: number;
  numeroAffaire: string;
  titre: string;
  statut: DossierStatut;
  dateOuverture: string;
  dateCloture: string | null;
  juridiction: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DossiersPage {
  page: number;
  pageSize: number;
  total: number;
  data: Dossier[];
}

export interface QueryDossiers {
  statut?: DossierStatut;
  avocatId?: number;
  juridiction?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateDossierDto {
  clientId: number;
  titre: string;
  juridiction?: string;
  notes?: string;
  avocatResponsableId?: number;
  clientUuid?: string;
}

export interface UpdateDossierDto {
  titre?: string;
  juridiction?: string;
  notes?: string;
  statut?: DossierStatut;
  avocatResponsableId?: number;
  versionConnue?: number;
}

export interface Rentabilite {
  totalFacture: number;
  totalEncaisse: number;
  soldeRestant: number;
}

// ── Fonctions API ─────────────────────────────────────────────────────────────

export async function getDossiers(params: QueryDossiers = {}): Promise<DossiersPage> {
  const query = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    ...(params.statut && { statut: params.statut }),
    ...(params.avocatId && { avocatId: params.avocatId }),
    ...(params.juridiction && { juridiction: params.juridiction }),
  };
  const { data } = await api.get<DossiersPage>('/dossiers', { params: query });
  return data;
}

export async function getDossier(id: number): Promise<Dossier> {
  const { data } = await api.get<Dossier>(`/dossiers/${id}`);
  return data;
}

export async function createDossier(dto: CreateDossierDto): Promise<Dossier> {
  const { data } = await api.post<Dossier>('/dossiers', dto);
  return data;
}

export async function updateDossier(id: number, dto: UpdateDossierDto): Promise<Dossier> {
  const { data } = await api.patch<Dossier>(`/dossiers/${id}`, dto);
  return data;
}

export async function cloturerDossier(id: number): Promise<Dossier> {
  const { data } = await api.post<Dossier>(`/dossiers/${id}/cloturer`);
  return data;
}

export async function getRentabiliteDossier(id: number): Promise<Rentabilite> {
  const { data } = await api.get<Rentabilite>(`/dossiers/${id}/rentabilite`);
  return data;
}

export async function deleteDossier(id: number): Promise<void> {
  await api.delete(`/dossiers/${id}`);
}
