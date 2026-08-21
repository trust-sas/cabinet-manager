/**
 * src/hooks/useIsConnected.ts
 * ─────────────────────────────────────────────────────────────────
 * Hook personnalisé de surveillance de la connectivité réseau
 * basé sur @react-native-community/netinfo.
 *
 * Expose :
 *  - isConnected : boolean (true si le terminal est connecté au réseau)
 *  - networkType : type de réseau ('wifi', 'cellular', 'ethernet', etc.)
 *  - isInternetReachable : boolean (true si internet répond réellement)
 * ─────────────────────────────────────────────────────────────────
 */

import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  networkType: NetInfoStateType | string;
}

export function useIsConnected(): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    networkType: NetInfoStateType.other,
  });

  useEffect(() => {
    // 1. Vérification ponctuelle initiale
    NetInfo.fetch().then((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
        networkType: state.type,
      });
    });

    // 2. Écoute en temps réel des changements d'état réseau
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
        networkType: state.type,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return networkState;
}

export default useIsConnected;
