/**
 * src/hooks/useSocialAuth.ts
 * Authentification sociale réelle via expo-auth-session (Google) et expo-apple-authentication (Apple).
 *
 * FLUX GOOGLE (expo-auth-session + PKCE) :
 *   1. Ouvre un navigateur OAuth Google
 *   2. Récupère l'idToken JWT Google
 *   3. Envoie l'idToken au backend /auth/google
 *   4. Le backend valide, crée/retrouve l'utilisateur et retourne les tokens JWT app
 *
 * FLUX APPLE (expo-apple-authentication — iOS uniquement) :
 *   1. Ouvre le dialog natif Apple Sign In
 *   2. Récupère l'identityToken
 *   3. Envoie l'identityToken au backend /auth/apple
 *   4. Le backend valide et retourne les tokens JWT app
 *
 * IMPORTANT : Pour Google, vous devez créer des identifiants OAuth dans
 * Google Cloud Console et renseigner les variables dans .env.local :
 *   EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=xxx.apps.googleusercontent.com
 *   EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=xxx.apps.googleusercontent.com (iOS)
 *   EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=xxx.apps.googleusercontent.com (Android)
 */

import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import api from '@/lib/api';
import { saveTokens, saveUser } from '@/lib/secureStorage';

// Nécessaire pour que le navigateur OAuth revienne à l'app sur Android
WebBrowser.maybeCompleteAuthSession();

// ─── Types ───────────────────────────────────────────────────────────────────

/** Réponse backend : { accessToken, refreshToken, expiresIn } */
interface BackendTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

/** Profil utilisateur renvoyé par /auth/me */
export interface SocialUser {
  id: number;
  email: string;
  nom: string;
  role: string;
}

export interface SocialAuthResult {
  accessToken: string;
  refreshToken: string;
  user: SocialUser;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'cabinetmanager',
    path: 'auth/callback',
  });

  // Lire les Client IDs depuis les variables d'environnement Expo
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '';
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '';
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '';

  const clientId = Platform.select({
    ios: iosClientId || webClientId,
    android: androidClientId || webClientId,
    default: webClientId,
  }) || webClientId;

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
    },
    GOOGLE_DISCOVERY,
  );

  const signIn = async (): Promise<SocialAuthResult | null> => {
    if (!clientId) {
      throw new Error(
        'Client ID Google manquant.\n' +
        'Ajoutez EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB dans .env.local\n' +
        'Voir : https://console.cloud.google.com/'
      );
    }

    const result = await promptAsync();

    if (result?.type !== 'success') {
      if (result?.type === 'cancel' || result?.type === 'dismiss') {
        return null; // Annulé par l'utilisateur
      }
      throw new Error('Connexion Google annulée ou échouée.');
    }

    const idToken = result.params?.id_token;
    if (!idToken) {
      throw new Error('Aucun token Google reçu.');
    }

    // Envoyer l'idToken au backend pour validation
    const { data: tokens } = await api.post<BackendTokenPair>('/auth/google', { idToken });

    // Sauvegarder les tokens
    await saveTokens(tokens.accessToken, tokens.refreshToken);

    // Récupérer le profil utilisateur
    const { data: user } = await api.get<SocialUser>('/auth/me');
    await saveUser(user as any);

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user };
  };

  return { request, signIn };
}

// ─── Apple Sign In ────────────────────────────────────────────────────────────

export async function signInWithApple(): Promise<SocialAuthResult | null> {
  // Apple Sign In n'est disponible que sur iOS natif
  if (Platform.OS !== 'ios') {
    throw new Error(
      "Apple Sign In n'est disponible que sur iPhone/iPad.\n" +
      'Sur Android, utilisez la connexion Google ou Email.'
    );
  }

  try {
    // Import dynamique pour éviter les erreurs sur Android
    const AppleAuth = await import('expo-apple-authentication');

    const available = await AppleAuth.isAvailableAsync();
    if (!available) {
      throw new Error(
        "Apple Sign In n'est pas disponible sur cet appareil.\n" +
        'Assurez-vous d\'être connecté avec un Apple ID.'
      );
    }

    // Générer un nonce aléatoire pour sécuriser la requête
    const rawNonce = Array.from(
      await Crypto.getRandomBytesAsync(32),
      byte => byte.toString(16).padStart(2, '0'),
    ).join('');

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
      nonce: rawNonce,
    });

    const { identityToken, email, fullName } = credential;
    if (!identityToken) {
      throw new Error('Aucun token Apple reçu.');
    }

    // Construire le nom (Apple ne fournit le nom qu'à la 1ère connexion)
    const nom = fullName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
      : undefined;

    // Envoyer l'identityToken au backend pour validation
    const { data: tokens } = await api.post<BackendTokenPair>('/auth/apple', {
      identityToken,
      email,
      nom,
      nonce: rawNonce,
    });

    // Sauvegarder les tokens
    await saveTokens(tokens.accessToken, tokens.refreshToken);

    // Récupérer le profil utilisateur
    const { data: user } = await api.get<SocialUser>('/auth/me');
    await saveUser(user as any);

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user };
  } catch (error: any) {
    // L'utilisateur a annulé
    if (error?.code === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    throw error;
  }
}
