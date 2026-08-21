/**
 * src/hooks/useWebSocket.ts
 * ─────────────────────────────────────────────────────────────────
 * Hook React pour écouter et envoyer des événements WebSocket en temps réel.
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import globalWebSocket, { WebSocketClient } from '@/lib/webSocketService';

export interface UseWebSocketReturn {
  isConnected: boolean;
  sendMessage: (data: any) => void;
  lastMessage: any;
}

export function useWebSocket(customUrl?: string, autoConnect: boolean = true): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    const wsClient: WebSocketClient = customUrl ? new WebSocketClient(customUrl) : globalWebSocket;

    if (autoConnect) {
      wsClient.connect();
    }

    const unsubState = wsClient.onStateChange((connected) => {
      setIsConnected(connected);
    });

    const unsubMessage = wsClient.onMessage((msg) => {
      setLastMessage(msg);
    });

    return () => {
      unsubState();
      unsubMessage();
    };
  }, [customUrl, autoConnect]);

  const sendMessage = useCallback((data: any) => {
    globalWebSocket.send(data);
  }, []);

  return {
    isConnected,
    sendMessage,
    lastMessage,
  };
}

export default useWebSocket;
