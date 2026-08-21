/**
 * src/lib/httpService.ts
 * ─────────────────────────────────────────────────────────────────
 * Service de requêtes HTTP REST avec :
 *  1. Client Fetch natif (sans dépendance externe)
 *  2. Client Axios avancé (avec gestion automatique des erreurs, timeouts, headers et Bearer tokens)
 * ─────────────────────────────────────────────────────────────────
 */

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import api from './api';
import { API_BASE_URL } from './constants';

// ── 1. Client Fetch natif ───────────────────────────────────────────────────

/**
 * Effectue une requête GET native avec fetch()
 */
export const getDataFetch = async <T = any>(url: string, headers: Record<string, string> = {}): Promise<T> => {
  try {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error('[Fetch Network Error]:', error);
    throw error;
  }
};

/**
 * Effectue une requête POST native avec fetch()
 */
export const postDataFetch = async <T = any>(url: string, body: any, headers: Record<string, string> = {}): Promise<T> => {
  try {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error('[Fetch Network Error]:', error);
    throw error;
  }
};

// ── 2. Client Axios (gestion centralisée des requêtes REST) ─────────────────

/**
 * Effectue une requête GET sécurisée avec Axios
 */
export const getDataAxios = async <T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<T> => {
  try {
    const response: AxiosResponse<T> = await api.get<T>(endpoint, config);
    return response.data;
  } catch (error: any) {
    console.error('[Axios GET Error]:', error?.response?.data || error?.message || error);
    throw error;
  }
};

/**
 * Effectue une requête POST sécurisée avec Axios
 */
export const postDataAxios = async <T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  try {
    const response: AxiosResponse<T> = await api.post<T>(endpoint, data, config);
    return response.data;
  } catch (error: any) {
    console.error('[Axios POST Error]:', error?.response?.data || error?.message || error);
    throw error;
  }
};

/**
 * Effectue une requête PUT sécurisée avec Axios
 */
export const putDataAxios = async <T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  try {
    const response: AxiosResponse<T> = await api.put<T>(endpoint, data, config);
    return response.data;
  } catch (error: any) {
    console.error('[Axios PUT Error]:', error?.response?.data || error?.message || error);
    throw error;
  }
};

/**
 * Effectue une requête DELETE sécurisée avec Axios
 */
export const deleteDataAxios = async <T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<T> => {
  try {
    const response: AxiosResponse<T> = await api.delete<T>(endpoint, config);
    return response.data;
  } catch (error: any) {
    console.error('[Axios DELETE Error]:', error?.response?.data || error?.message || error);
    throw error;
  }
};
