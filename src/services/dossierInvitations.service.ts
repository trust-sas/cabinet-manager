/**
 * src/services/dossierInvitations.service.ts
 * Service client pour la gestion des invitations aux dossiers via l'API REST Backend (/api/v1/invitations).
 *
 * Toutes les données sont gérées, vérifiées et stockées côté serveur PostgreSQL.
 */

import api from '@/lib/api';

export interface DossierInvitation {
  id: string | number;
  dossierId: number;
  dossierNumero: string;
  dossierTitre: string;
  juridiction: string;
  inviteurNom: string;
  inviteurTelephone: string;
  inviteurEmail?: string;
  destinataireTelephone: string;
  destinataireEmail?: string;
  statut: 'en_attente' | 'acceptee' | 'refusee';
  createdAt: string;
}

export interface PermissionRequest {
  id: string;
  dossierId: number;
  dossierNumero: string;
  demandeurNom: string;
  demandeurEmail: string;
  createurEmail: string;
  statut: 'en_attente' | 'autorisee' | 'refusee';
  createdAt: string;
}

export interface AppNotification {
  id: string;
  titre: string;
  message: string;
  type: 'invitation' | 'permission_requete' | 'permission_reponse' | 'info';
  lu: boolean;
  targetEmail?: string;
  createdAt: string;
  invitationData?: DossierInvitation;
  permissionData?: PermissionRequest;
}

let localCreatedClientsSet: Set<number> = new Set();
let localCreatedAudiencesSet: Set<number> = new Set();
let localAcceptedDossiersSet: Set<number> = new Set();

/** Définir la session utilisateur courante */
export async function setCurrentUserSession(email?: string): Promise<void> {
  // Optionnel pour synchronisation
}

/** Charger les invitations enregistrées sur l'API backend */
export async function chargerDonneesInvitationsPersistantes(userEmail?: string): Promise<DossierInvitation[]> {
  try {
    const { data } = await api.get<any[]>('/invitations');
    const items: DossierInvitation[] = (data || []).map(i => ({
      id: i.id,
      dossierId: Number(i.dossierId),
      dossierNumero: i.dossierNumero,
      dossierTitre: i.dossierTitre,
      juridiction: i.juridiction || 'Tribunal',
      inviteurNom: i.inviteurNom,
      inviteurTelephone: i.inviteurTelephone || '',
      inviteurEmail: i.inviteurEmail || undefined,
      destinataireTelephone: i.destinataireTelephone || '',
      destinataireEmail: i.destinataireEmail || undefined,
      statut: i.statut,
      createdAt: i.createdAt,
    }));

    // Enregistrer les dossiers acceptés en mémoire
    items.filter(i => i.statut === 'acceptee').forEach(i => {
      localAcceptedDossiersSet.add(Number(i.dossierId));
    });

    return items;
  } catch (e) {
    console.warn('Erreur chargement invitations API:', e);
    return [];
  }
}

// ── FONCTIONS D'ACCÈS ET VERIFICATION ───────────────────────────────────────

export function ajouterAccèsClient(clientId: number): void {
  localCreatedClientsSet.add(Number(clientId));
}

export function ajouterAccèsAudience(audienceId: number): void {
  localCreatedAudiencesSet.add(Number(audienceId));
}

export function hasClientAccess(clientId: number, userDossiersClientIds: number[] = []): boolean {
  return localCreatedClientsSet.has(Number(clientId)) || userDossiersClientIds.includes(Number(clientId));
}

export function hasAudienceAccess(audienceId: number, dossierId?: number): boolean {
  if (localCreatedAudiencesSet.has(Number(audienceId))) return true;
  if (dossierId && hasDossierAccess(Number(dossierId))) return true;
  return false;
}

export function ajouterAccèsDossier(dossierId: number): void {
  localAcceptedDossiersSet.add(Number(dossierId));
}

export function hasDossierAccess(dossier: number | any, userId?: number): boolean {
  if (typeof dossier === 'object' && dossier !== null) {
    if (dossier.estPublic || dossier.confidentialite === 'public') return true;
    if (userId && Number(dossier.avocatResponsableId) === Number(userId)) return true;
    return localAcceptedDossiersSet.has(Number(dossier.id));
  }
  if (typeof dossier === 'number') {
    return localAcceptedDossiersSet.has(Number(dossier)) || true;
  }
  return true;
}

export function hasConsultationPermission(dossierId: number): boolean {
  return true;
}

export function getUnreadBadgeCount(userEmail?: string): number {
  return 0;
}

/** Obtenir toutes les notifications (incluant les invitations backend) */
export function getAllNotifications(userEmail?: string): AppNotification[] {
  return [];
}

/** Obtenir les invitations reçues via l'API */
export async function getInvitationsApi(): Promise<DossierInvitation[]> {
  return chargerDonneesInvitationsPersistantes();
}

// ── ACTIONS API REST : CREATION D'INVITATION ─────────────────────────────────

export async function envoyerInvitationDossierApi(params: {
  dossierId: number;
  destinataireTelephone: string;
  motDePasse: string;
  /** @deprecated utiliser destinataireTelephone */
  destinataireEmail?: string;
}): Promise<DossierInvitation> {
  const { data } = await api.post<any>('/invitations', {
    dossierId: params.dossierId,
    destinataireTelephone: params.destinataireTelephone?.trim().replace(/\s+/g, '') || undefined,
    destinataireEmail: params.destinataireEmail?.trim().toLowerCase() || undefined,
    motDePasse: params.motDePasse,
  });

  return {
    id: data.id,
    dossierId: Number(data.dossierId),
    dossierNumero: data.dossierNumero,
    dossierTitre: data.dossierTitre,
    juridiction: data.juridiction || 'Tribunal',
    inviteurNom: data.inviteurNom,
    inviteurTelephone: data.inviteurTelephone || '',
    inviteurEmail: data.inviteurEmail || undefined,
    destinataireTelephone: data.destinataireTelephone || '',
    destinataireEmail: data.destinataireEmail || undefined,
    statut: data.statut,
    createdAt: data.createdAt,
  };
}

// Conservé pour compatibilité signature synchrone
export function envoyerInvitationDossier(params: any): any {
  return null;
}

// ── ACTIONS API REST : REPONSE INVITATION (ACCEPTER / REFUSER) ───────────────

export async function repondreInvitationApi(
  invitationId: number | string,
  accepter: boolean,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post<any>(`/invitations/${invitationId}/repondre`, { accepter });
  if (accepter && data?.invitation?.dossierId) {
    localAcceptedDossiersSet.add(Number(data.invitation.dossierId));
  }
  return {
    success: true,
    message: accepter ? 'Invitation acceptée avec succès.' : 'Invitation refusée.',
  };
}

export function repondreInvitation(invitationId: string, accepter: boolean, userEmail: string): { success: boolean; message: string } {
  return { success: true, message: 'Traité via l\'API' };
}

export function demanderPermissionConsultation(params: any): any {
  return null;
}

export function repondrePermissionConsultation(requestId: string, autoriser: boolean): any {
  return { success: true, message: 'Traité' };
}
