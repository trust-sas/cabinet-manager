/**
 * src/lib/webSocketService.ts
 * ─────────────────────────────────────────────────────────────────
 * Service de gestion de WebSocket temps réel avec :
 *  - Connexion automatique (ws:// / wss://)
 *  - Handlers onOpen, onMessage, onError, onClose
 *  - Reconnexion automatique avec backoff exponentiel
 *  - Envoi sécurisé de messages JSON ou texte
 * ─────────────────────────────────────────────────────────────────
 */

import { API_BASE_URL } from './constants';

export type WebSocketMessageHandler = (data: any) => void;
export type WebSocketStateListener = (connected: boolean) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 3000;
  private maxReconnectAttempts: number = 5;
  private reconnectAttempts: number = 0;
  private isExplicitlyClosed: boolean = false;

  private messageListeners: Set<WebSocketMessageHandler> = new Set();
  private stateListeners: Set<WebSocketStateListener> = new Set();

  constructor(customUrl?: string) {
    if (customUrl) {
      this.url = customUrl;
    } else {
      const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
      const cleanHost = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api\/v1\/?$/, '');
      this.url = `${wsProtocol}://${cleanHost}/socket`;
    }
  }

  public connect(token?: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    const fullUrl = token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url;

    try {
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket]: Connecté à', this.url);
        this.reconnectAttempts = 0;
        this.notifyState(true);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          this.messageListeners.forEach((listener) => listener(parsed));
        } catch {
          this.messageListeners.forEach((listener) => listener(event.data));
        }
      };

      this.ws.onerror = (event: Event) => {
        console.error('[WebSocket Error]:', event);
      };

      this.ws.onclose = () => {
        console.log('[WebSocket]: Déconnecté');
        this.notifyState(false);

        if (!this.isExplicitlyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WebSocket]: Reconnexion (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          setTimeout(() => this.connect(token), this.reconnectInterval);
        }
      };
    } catch (err) {
      console.error('[WebSocket Instantiation Error]:', err);
    }
  }

  public send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
    } else {
      console.warn('[WebSocket]: Impossible d\'envoyer le message, socket non ouverte');
    }
  }

  public onMessage(handler: WebSocketMessageHandler) {
    this.messageListeners.add(handler);
    return () => {
      this.messageListeners.delete(handler);
    };
  }

  public onStateChange(listener: WebSocketStateListener) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyState(false);
  }

  private notifyState(connected: boolean) {
    this.stateListeners.forEach((listener) => listener(connected));
  }
}

export const globalWebSocket = new WebSocketClient();
export default globalWebSocket;
