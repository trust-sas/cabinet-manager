/**
 * src/services/documents.service.ts
 * Fonctions API pour la gestion des documents (GED).
 */
import api from '@/lib/api';
import { API_BASE_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/secureStorage';

export type DocumentConfidentialite = 'public' | 'confidentiel' | 'secret';

export interface Document {
  id: number;
  cabinetId: number;
  dossierId: number | null;
  nom: string;
  typeDocument: string | null;
  cheminFichier: string | null;
  tailleKo: number | null;
  confidentialite: DocumentConfidentialite;
  description: string | null;
  tags: string[] | null;
  creePar: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentsPage {
  page: number;
  pageSize: number;
  total: number;
  data: Document[];
}

export interface QueryDocuments {
  dossierId?: number;
  typeDocument?: string;
  confidentialite?: DocumentConfidentialite;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateDocumentDto {
  nom: string;
  dossierId?: number;
  typeDocument?: string;
  cheminFichier?: string;
  tailleKo?: number;
  confidentialite?: DocumentConfidentialite;
  description?: string;
  tags?: string[];
}

export interface UpdateDocumentDto {
  nom?: string;
  typeDocument?: string;
  cheminFichier?: string;
  tailleKo?: number;
  confidentialite?: DocumentConfidentialite;
  description?: string;
  tags?: string[];
}

export async function getDocuments(params: QueryDocuments = {}): Promise<DocumentsPage> {
  const { data } = await api.get<DocumentsPage>('/documents', {
    params: { page: 1, pageSize: 50, ...params },
  });
  return data;
}

export async function getDocument(id: number): Promise<Document> {
  const { data } = await api.get<Document>(`/documents/${id}`);
  return data;
}

export async function createDocument(dto: CreateDocumentDto): Promise<Document> {
  const { data } = await api.post<Document>('/documents', dto);
  return data;
}

export async function updateDocument(id: number, dto: UpdateDocumentDto): Promise<Document> {
  const { data } = await api.patch<Document>(`/documents/${id}`, dto);
  return data;
}

export async function deleteDocument(id: number): Promise<void> {
  await api.delete(`/documents/${id}`);
}

/**
 * Upload d'un fichier réel via multipart/form-data.
 * @param fileAsset - asset retourné par expo-document-picker
 * @param dossierId  - ID du dossier auquel rattacher le document (optionnel)
 */
export async function uploadDocument(
  fileAsset: { uri: string; name: string; mimeType?: string },
  dossierId?: number,
  typeDocument?: string,
  description?: string,
): Promise<Document> {
  const formData = new FormData();
  formData.append('file', {
    uri:  fileAsset.uri,
    name: fileAsset.name,
    type: fileAsset.mimeType ?? 'application/octet-stream',
  } as unknown as Blob);

  if (dossierId)    formData.append('dossierId',    String(dossierId));
  if (typeDocument) formData.append('typeDocument', typeDocument);
  if (description)  formData.append('description',  description);

  const { data } = await api.post<Document>('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * Construit l'URL de téléchargement pour expo-file-system.downloadAsync.
 */
export async function buildDownloadHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getDocumentDownloadUrl(id: number): string {
  return `${API_BASE_URL}/documents/${id}/download`;
}

export interface DocumentAccessStatus {
  canAccess: boolean;
  isSecret: boolean;
  isOwner: boolean;
  hasPendingRequest: boolean;
  permissionId?: number;
}

export interface DocumentPermissionItem {
  id: number;
  documentId: number;
  dossierId: number;
  demandeurId: number;
  demandeurNom: string | null;
  demandeurTelephone: string | null;
  demandeurEmail: string | null;
  createurId: number;
  documentNom: string | null;
  dossierNumero: string | null;
  statut: 'en_attente' | 'autorisee' | 'refusee';
  createdAt: string;
  updatedAt: string;
}

export async function getDocumentAccessStatus(id: number): Promise<DocumentAccessStatus> {
  const { data } = await api.get<DocumentAccessStatus>(`/documents/${id}/access-status`);
  return data;
}

export async function demanderAccesDocument(id: number): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post<{ success: boolean; message: string }>(`/documents/${id}/demander-acces`);
  return data;
}

export async function repondreDemandeAccesDocument(
  permissionId: number,
  autoriser: boolean,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post<{ success: boolean; message: string }>(
    `/documents/permissions/${permissionId}/repondre`,
    { autoriser },
  );
  return data;
}

export async function getMesDemandesPermissions(): Promise<DocumentPermissionItem[]> {
  const { data } = await api.get<DocumentPermissionItem[]>('/documents/permissions/mes-demandes');
  return data;
}
