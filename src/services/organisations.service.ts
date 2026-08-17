import api from '@/lib/api';

export interface Organisation {
  nom: string;
  description: string | null;
  creatorId: number;
  createdAt: string;
  deletedAt: string | null;
  role?: 'chef' | 'membre';
  nbMembres?: number;
  nbDossiers?: number;
}

export interface OrganisationDetails extends Organisation {
  estMembre: boolean;
  membres: OrganisationMembre[];
  dossiers: OrgDossier[];
  clients: OrgClient[];
  demandesEnAttente: JoinRequest[];
}

export interface OrganisationMembre {
  userId: number;
  role: 'chef' | 'membre';
  joinedAt: string;
  nom: string;
  email: string;
  telephone?: string;
}

export interface OrgDossier {
  id: number;
  titre: string;
  numeroAffaire: string;
  statut: string;
  juridiction?: string;
  dateOuverture?: string;
  proprietaireId: number;
  proprietaireNom: string;
  estProprietaire: boolean;
  sharedAt: string;
}

export interface OrgClient {
  id: number;
  nomComplet: string;
  telephone?: string;
  email?: string;
  partagePar: number;
  estProprietaire: boolean;
}

export interface JoinRequest {
  id: number;
  organisationNom: string;
  userId: number;
  statut: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  user?: { nom?: string; email?: string };
}

// ── Organisations ────────────────────────────────────────────────────────────

export const listerOrganisations = async (): Promise<Organisation[]> => {
  const { data } = await api.get<Organisation[]>('/organisations');
  return data;
};

export const mesMemberships = async (): Promise<Organisation[]> => {
  const { data } = await api.get<Organisation[]>('/organisations/mes');
  return data;
};

export const getOrganisationDetails = async (nom: string): Promise<OrganisationDetails> => {
  const { data } = await api.get<OrganisationDetails>(`/organisations/${encodeURIComponent(nom)}`);
  return data;
};

export const creerOrganisation = async (payload: { nom: string; description?: string }): Promise<Organisation> => {
  const { data } = await api.post<Organisation>('/organisations', payload);
  return data;
};

export const modifierOrganisation = async (
  nom: string,
  payload: { nom?: string; description?: string },
): Promise<Organisation> => {
  const { data } = await api.patch<Organisation>(`/organisations/${encodeURIComponent(nom)}`, payload);
  return data;
};

export const supprimerOrganisation = async (nom: string): Promise<void> => {
  await api.delete(`/organisations/${encodeURIComponent(nom)}`);
};

// ── Membres ──────────────────────────────────────────────────────────────────

export const ajouterMembre = async (nom: string, userId: number): Promise<void> => {
  await api.post(`/organisations/${encodeURIComponent(nom)}/membres`, { userId });
};

export const supprimerMembre = async (nom: string, userId: number): Promise<void> => {
  await api.delete(`/organisations/${encodeURIComponent(nom)}/membres/${userId}`);
};

// ── Demandes de rejoindre ─────────────────────────────────────────────────────

export const demanderRejoindre = async (nom: string): Promise<void> => {
  await api.post(`/organisations/${encodeURIComponent(nom)}/rejoindre`, {});
};

export const traiterDemande = async (id: number, action: 'accepted' | 'rejected'): Promise<void> => {
  await api.patch(`/organisations/demandes/${id}`, { action });
};

// ── Partage sélectif ──────────────────────────────────────────────────────────

export const partagerDossier = async (nom: string, dossierId: number): Promise<void> => {
  await api.post(`/organisations/${encodeURIComponent(nom)}/dossiers`, { dossierId });
};

export const retirerDossier = async (nom: string, dossierId: number): Promise<void> => {
  await api.delete(`/organisations/${encodeURIComponent(nom)}/dossiers/${dossierId}`);
};

export const partagerClient = async (nom: string, clientId: number): Promise<void> => {
  await api.post(`/organisations/${encodeURIComponent(nom)}/clients`, { clientId });
};

export const retirerClient = async (nom: string, clientId: number): Promise<void> => {
  await api.delete(`/organisations/${encodeURIComponent(nom)}/clients/${clientId}`);
};
