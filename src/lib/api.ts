/**
 * src/lib/api.ts
 * Client HTTP centralisé (axios) avec :
 *  - Injection automatique du Bearer token sur chaque requête
 *  - Rafraîchissement silencieux du token d'accès expiré (401)
 *  - File d'attente des requêtes pendant le refresh (évite les races)
 *  - Propagation d'une erreur AuthExpired quand le refresh échoue
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from './constants';
import {
  clearAll,
  getAccessToken,
  getOrCreateDeviceId,
  getRefreshToken,
  saveTokens,
} from './secureStorage';

// ── Types réponses backend ────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PreAuthResponse {
  requiresTwoFactor: true;
  preAuthToken: string;
}

export type LoginResponse = TokenPair | PreAuthResponse;

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string | { code?: string; message?: string; status?: number };
}

// ── Gestion de la file pendant le refresh ────────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token as string);
  });
  failedQueue = [];
}

// ── Création de l'instance axios ─────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Intercepteur REQUEST : ajoute Bearer + X-Device-Id ───────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const [token, deviceId] = await Promise.all([
    getAccessToken(),
    getOrCreateDeviceId(),
  ]);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Device-Id'] = deviceId;
  return config;
});

// ── Intercepteur RESPONSE : gère les 401 avec refresh silencieux ─────────────

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const isAuthRoute = Boolean(
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/verify') ||
      originalRequest?.url?.includes('/auth/send')
    );

    // Seules les 401 sur des requêtes normales (non-auth) déclenchent le refresh
    if (error.response?.status !== 401 || originalRequest._retry || isAuthRoute) {
      return Promise.reject(error);
    }

    // Si un refresh est déjà en cours → mise en file d'attente
    if (isRefreshing) {
      return new Promise<AxiosResponse>((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      const deviceId = await getOrCreateDeviceId();

      if (!refreshToken) throw new Error('No refresh token');

      // Appel direct (sans intercepteur) pour éviter la récursion
      const { data } = await axios.post<TokenPair>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { headers: { 'X-Device-Id': deviceId } },
      );

      await saveTokens(data.accessToken, data.refreshToken);
      processQueue(null, data.accessToken);

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      // Session définitivement expirée → nettoyage complet
      await clearAll();
      // L'AuthContext écoute cet événement pour rediriger vers /login
      authExpiredEmitter.emit();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ── Émetteur léger d'événement "session expirée" ─────────────────────────────
// Permet à l'AuthContext de réagir sans couplage circulaire.

type Listener = () => void;

export const authExpiredEmitter = {
  _listeners: [] as Listener[],
  on(fn: Listener) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  },
  emit() {
    this._listeners.forEach((fn) => fn());
  },
};

// ── Helpers pour extraire le message d'erreur ─────────────────────────────────

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (typeof data?.error === 'object' && data.error?.message) {
      return data.error.message;
    }
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }
    const status = error.response?.status;
    if (status === 401) return 'Adresse e-mail ou mot de passe incorrect. Veuillez vérifier vos identifiants.';
    if (status === 403) return 'Accès non autorisé. Vous n’avez pas les droits requis pour cette opération.';
    if (status === 404) return 'Élément introuvable ou déplacé.';
    if (status === 409) return 'Ces informations existent déjà dans votre espace.';
    if (status === 422) return 'Saisie incomplète. Veuillez vérifier les champs du formulaire.';
    if (status && status >= 500) return 'Le service est temporairement indisponible. Veuillez réessayer dans un instant.';
    if (error.message === 'Network Error') return 'Connexion au serveur impossible. Veuillez vérifier votre connexion internet.';
    if (error.code === 'ECONNABORTED') return 'Le délai de réponse a été dépassé. Veuillez réessayer.';
  }
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue. Veuillez réessayer.';
}

export function formatPhoneWithCountryCode(phone: string): string {
  let clean = (phone || '').trim().replace(/\s+/g, '');
  if (!clean) return '';
  if (!clean.startsWith('+') && !clean.includes('@')) {
    clean = `+237${clean.replace(/^0/, '')}`;
  }
  return clean;
}

export default api;
