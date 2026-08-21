/**
 * src/lib/constants.ts
 * URL de base de l'API backend.
 *
 * Priorité de résolution :
 *  1. Variable d'environnement EXPO_PUBLIC_API_URL (EAS Build / .env.local)
 *  2. Détection automatique de l'IP du PC hôte via Expo Constants (Expo Go / Smartphone physique)
 *  3. Fallback Émulateur / Simulator / Localhost
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

function resolveApiBaseUrl(): string {
  // 1. Web browser dynamic host (sur navigateur Web, joindre le port 3007 de l'hôte courant)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3007/api/v1`;
  }

  // 2. Variable d'env explicite (.env.local, EAS Build)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 3. Détection automatique en développement mobile (Expo Go)
  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri || (Constants.manifest2?.extra?.expoGo as any)?.debuggerHost;
    if (hostUri) {
      const hostIp = hostUri.split(':')[0];
      if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
        return `http://${hostIp}:3007/api/v1`;
      }
    }

    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3007/api/v1';
    }

    return 'http://localhost:3007/api/v1';
  }

  return 'http://192.168.100.132:3007/api/v1';
}

export const API_BASE_URL = resolveApiBaseUrl();

// Durée d'expiration du token d'accès en millisecondes (14 min pour avoir une marge)
export const ACCESS_TOKEN_EXPIRY_MS = 14 * 60 * 1000;
