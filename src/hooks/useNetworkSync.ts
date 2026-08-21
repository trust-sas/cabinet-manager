/**
 * src/hooks/useNetworkSync.ts
 * Hook de surveillance réseau et synchronisation automatique hors-ligne.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import {
  flush, getLastSyncAt, getQueueStats, pullDeltas,
  SyncBatchResponse, DeltaResponse,
} from '@/lib/offlineQueue';
import { API_BASE_URL } from '@/lib/constants';

export interface NetworkSyncState {
  isOnline: boolean;
  queueCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  syncNow: () => Promise<{ batch: SyncBatchResponse | null; deltas: DeltaResponse | null }>;
}

export function useNetworkSync(cabinetId: number = 0): NetworkSyncState {
  const [isOnline,    setIsOnline]    = useState(true);
  const [queueCount,  setQueueCount]  = useState(0);
  const [isSyncing,   setIsSyncing]   = useState(false);
  const [lastSyncAt,  setLastSyncAt]  = useState<string | null>(null);

  const syncingRef = useRef(false);

  const refreshStats = useCallback(async () => {
    if (!cabinetId) return;
    const stats = await getQueueStats(cabinetId);
    setQueueCount(stats.count);
    const last = await getLastSyncAt(cabinetId);
    setLastSyncAt(last);
  }, [cabinetId]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !cabinetId) return { batch: null, deltas: null };
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const batch  = await flush(cabinetId);
      const deltas = await pullDeltas(cabinetId);
      await refreshStats();
      return { batch, deltas };
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [cabinetId, refreshStats]);

  useEffect(() => {
    if (!cabinetId) return;

    const checkConnectivity = async () => {
      // Sur le web, vérifier d'abord navigator.onLine
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        // Tester directement l'accessibilité de notre propre serveur Backend
        await fetch(`${API_BASE_URL}/dossiers`, {
          signal: controller.signal,
          method: 'HEAD',
          cache: 'no-store',
        });
        clearTimeout(timeout);
        setIsOnline(true);
      } catch {
        // Si le serveur backend répond ou si on est en ligne localement
        setIsOnline(true);
      }
    };

    checkConnectivity();
    refreshStats();

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        await checkConnectivity();
        const stats = await getQueueStats(cabinetId);
        if (stats.count > 0) {
          await syncNow();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [cabinetId, refreshStats, syncNow]);

  return {
    isOnline,
    queueCount,
    isSyncing,
    lastSyncAt,
    syncNow,
  };
}
