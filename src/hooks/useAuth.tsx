/**
 * src/hooks/useAuth.tsx
 * Context React global pour l'authentification.
 *
 * Expose :
 *  - user          : profil courant (null si non connecté)
 *  - isLoading     : true pendant la vérification initiale de session
 *  - login()       : credentials → tokenPair OU preAuthToken si 2FA requis
 *  - verify2fa()   : preAuthToken + code TOTP → tokenPair
 *  - logout()      : révoque le refresh token côté serveur + nettoie le stockage
 *  - isAuthenticated : dérivé de user != null
 */

import api, {
    authExpiredEmitter,
    extractErrorMessage,
    formatPhoneWithCountryCode,
    LoginResponse,
    TokenPair,
} from '@/lib/api';
import {
    clearAll,
    getAccessToken,
    getRefreshToken,
    getSavedUser,
    saveTokens,
    saveUser
} from '@/lib/secureStorage';
import { clearSessionData } from '@/lib/offlineQueue';
import { setCurrentUserSession } from '@/services/dossierInvitations.service';
import { useRouter, useSegments } from 'expo-router';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'Avocat' | 'Assistant' | 'Associe' | 'Administrateur';

export interface AuthUser {
  id: number;
  cabinetId: number;
  nom: string;
  email: string;
  role: UserRole;
  permissions: string[];
  authentif2faActif: boolean;
}

export interface LoginResult {
  /** Connexion directe réussie */
  success: true;
}

export interface TwoFactorRequired {
  /** Le serveur demande un code TOTP */
  requiresTwoFactor: true;
  preAuthToken: string;
}

export type LoginOutcome = LoginResult | TwoFactorRequired;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, motDePasse: string) => Promise<LoginOutcome>;
  loginWithSocial: (provider: 'google' | 'apple', email: string, nom?: string) => Promise<void>;
  sendOtp: (target: string) => Promise<{ success: boolean; message: string; code?: string }>;
  verifyOtp: (target: string, code: string) => Promise<{ verified: true; target?: string; email?: string }>;
  verify2fa: (preAuthToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ── Création du context ───────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  // Évite la double-navigation pendant le montage
  const hasNavigated = useRef(false);

  // ── Chargement initial de session ─────────────────────────────────────────

  useEffect(() => {
    async function initSession() {
      try {
        const token = await getAccessToken();
        if (!token) {
          setUser(null);
          return;
        }
        // Token présent → on recharge le profil depuis le cache d'abord
        const cached = await getSavedUser<AuthUser>();
        if (cached) {
          setUser(cached);
          await setCurrentUserSession(cached.email);
        }

        // Puis on valide avec le serveur (intercepteur gère le refresh si besoin)
        try {
          const { data } = await api.get<AuthUser>('/auth/me');
          setUser(data);
          await saveUser(data);
          await setCurrentUserSession(data.email);
        } catch {
          // /auth/me a échoué (refresh également échoué) → déjà nettoyé par l'intercepteur
          setUser(null);
          await setCurrentUserSession('');
        }
      } finally {
        setIsLoading(false);
      }
    }
    initSession();
  }, []);

  // ── Écoute de l'événement "session expirée" (depuis api.ts) ───────────────

  useEffect(() => {
    const unsubscribe = authExpiredEmitter.on(() => {
      setUser(null);
      router.replace('/login');
    });
    return unsubscribe;
  }, [router]);

  // ── Redirection automatique selon l'état d'auth ───────────────────────────

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inAdminGroup = segments[0] === 'admin';
    const onLogin = segments[0] === 'login' || segments[0] === undefined || (segments[0] as string) === 'index';

    if (!user && (inAuthGroup || inAdminGroup)) {
      hasNavigated.current = true;
      router.replace('/login');
    } else if (user && onLogin && !hasNavigated.current) {
      hasNavigated.current = true;
      if (user.role === 'Administrateur') {
        router.replace('/admin' as any);
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [user, isLoading, segments, router]);

  // ── login ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (
    identifiant: string,
    motDePasse: string,
  ): Promise<LoginOutcome> => {
    const formattedId = formatPhoneWithCountryCode(identifiant);
    const { data } = await api.post<LoginResponse>('/auth/login', {
      telephone: formattedId,
      identifiant: formattedId,
      email: formattedId,
      motDePasse,
    });

    if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
      return { requiresTwoFactor: true, preAuthToken: data.preAuthToken };
    }

    // Connexion directe (2FA désactivé)
    const tokens = data as TokenPair;
    await saveTokens(tokens.accessToken, tokens.refreshToken);

    const { data: profile } = await api.get<AuthUser>('/auth/me');
    setUser(profile);
    await saveUser(profile);
    await setCurrentUserSession(profile.email);
    hasNavigated.current = false;

    if (profile.role === 'Administrateur') {
      router.replace('/admin' as any);
    } else {
      router.replace('/(tabs)');
    }

    return { success: true };
  }, [router]);

  const loginWithSocial = useCallback(async (
    provider: 'google' | 'apple',
    email: string,
    nom?: string,
  ): Promise<void> => {
    const { data } = await api.post<TokenPair>(`/auth/${provider}`, { email, nom });
    await saveTokens(data.accessToken, data.refreshToken);
    const { data: profile } = await api.get<AuthUser>('/auth/me');
    setUser(profile);
    await saveUser(profile);
    await setCurrentUserSession(profile.email);
    hasNavigated.current = false;
    if (profile.role === 'Administrateur') {
      router.replace('/admin' as any);
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  // ── OTP SMS VERIFICATION ──────────────────────────────────────────────────

  const sendOtp = useCallback(async (target: string) => {
    const formattedTarget = formatPhoneWithCountryCode(target);
    const { data } = await api.post<{ success: boolean; message: string; code?: string }>('/auth/send-code', { telephone: formattedTarget, target: formattedTarget });
    return data;
  }, []);

  const verifyOtp = useCallback(async (target: string, code: string): Promise<{ verified: true; target?: string; email?: string }> => {
    const formattedTarget = formatPhoneWithCountryCode(target);
    const { data } = await api.post<{ verified: true; target?: string; email?: string }>('/auth/verify-code', { telephone: formattedTarget, target: formattedTarget, code });
    return data;
  }, []);

  // ── verify2fa ─────────────────────────────────────────────────────────────

  const verify2fa = useCallback(async (
    preAuthToken: string,
    code: string,
  ): Promise<void> => {
    const { data } = await api.post<TokenPair>('/auth/2fa/verify', {
      preAuthToken,
      code,
    });

    await saveTokens(data.accessToken, data.refreshToken);

    const { data: profile } = await api.get<AuthUser>('/auth/me');
    setUser(profile);
    await saveUser(profile);
    await setCurrentUserSession(profile.email);
    hasNavigated.current = false;
    if (profile.role === 'Administrateur') {
      router.replace('/admin' as any);
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  // ── logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore les erreurs réseau à la déconnexion
    } finally {
      if (user?.cabinetId) {
        await clearSessionData(user.cabinetId).catch(() => {});
      }
      await clearAll();
      await setCurrentUserSession('');
      setUser(null);
      hasNavigated.current = false;
    }
  }, [user]);

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      setUser(data);
      await saveUser(data);
    } catch (e) {
      console.warn('Erreur rafraîchissement profil:', e);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    loginWithSocial,
    sendOtp,
    verifyOtp,
    verify2fa,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook consommateur ─────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un <AuthProvider>");
  }
  return ctx;
}

export { extractErrorMessage };

