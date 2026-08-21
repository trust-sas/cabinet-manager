/**
 * src/services/facturation.service.ts
 * Fonctions API pour la gestion des factures et encaissements.
 */
import api from '@/lib/api';

export type FactureStatut = 'brouillon' | 'envoyee' | 'partielle' | 'payee' | 'en_retard';
export type ModePaiement = 'especes' | 'virement' | 'cheque' | 'mobile_money';

export interface Facture {
  id: number;
  cabinetId: number;
  dossierId: number;
  clientId: number;
  numeroFacture: string;
  dateEmission: string;
  dateEcheance: string | null;
  montantHt: number;
  tauxTva: number;
  montantTtc: number;
  montantEncaisse: number;
  statut: FactureStatut;
  description: string | null;
  encaissements?: Encaissement[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Encaissement {
  id: number;
  cabinetId: number;
  factureId: number;
  montant: number;
  datePaiement: string;
  modePaiement: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FacturesPage {
  page: number;
  pageSize: number;
  total: number;
  data: Facture[];
}

export interface QueryFactures {
  dossierId?: number;
  clientId?: number;
  statut?: FactureStatut;
  page?: number;
  pageSize?: number;
}

export interface CreateFactureDto {
  dossierId: number;
  clientId: number;
  montantHt: number;
  tauxTva?: number;
  dateEcheance?: string;
  description?: string;
}

export interface UpdateFactureDto {
  montantHt?: number;
  tauxTva?: number;
  dateEcheance?: string;
  description?: string;
  statut?: FactureStatut | string;
  montantEncaisse?: number;
  versionConnue?: number;
}

export interface CreateEncaissementDto {
  montant: number;
  datePaiement?: string;
  modePaiement?: string;
  reference?: string;
  notes?: string;
}

export async function getFactures(params: QueryFactures = {}): Promise<FacturesPage> {
  const { data } = await api.get<FacturesPage>('/factures', {
    params: { page: 1, pageSize: 50, ...params },
  });
  return data;
}

export async function getFacture(id: number): Promise<Facture> {
  const { data } = await api.get<Facture>(`/factures/${id}`);
  return data;
}

export async function createFacture(dto: CreateFactureDto): Promise<Facture> {
  const { data } = await api.post<Facture>('/factures', dto);
  return data;
}

export async function updateFacture(id: number, dto: UpdateFactureDto): Promise<Facture> {
  const { data } = await api.patch<Facture>(`/factures/${id}`, dto);
  return data;
}

export async function envoyerFacture(id: number): Promise<Facture> {
  const { data } = await api.post<Facture>(`/factures/${id}/envoyer`);
  return data;
}

export async function deleteFacture(id: number): Promise<void> {
  await api.delete(`/factures/${id}`);
}

export async function addEncaissement(factureId: number, dto: CreateEncaissementDto): Promise<Facture> {
  const { data } = await api.post<Facture>(`/factures/${factureId}/encaissements`, dto);
  return data;
}

export async function getEncaissements(factureId: number): Promise<Encaissement[]> {
  const { data } = await api.get<Encaissement[]>(`/factures/${factureId}/encaissements`);
  return data;
}

// Calcul du solde restant
export function getSoldeRestant(facture: Facture): number {
  return Number(facture.montantTtc) - Number(facture.montantEncaisse);
}

export function getTauxRecouvrement(facture: Facture): number {
  if (Number(facture.montantTtc) === 0) return 0;
  return Math.round((Number(facture.montantEncaisse) / Number(facture.montantTtc)) * 100);
}
