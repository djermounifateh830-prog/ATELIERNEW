import { AutoRefreshInterval, RealtimeStatus } from '../types';

type SyncCallback = (target?: string) => void;
type StatusCallback = (status: RealtimeStatus) => void;

class RealtimeSyncService {
  private mode: AutoRefreshInterval = 'sse';
  private eventSource: EventSource | null = null;
  private pollingTimer: any = null;
  private debounceTimer: any = null;
  private reconnectTimer: any = null;
  private syncListeners: Set<SyncCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private connected: boolean = false;
  private lastSyncTime: Date | null = new Date();
  private syncCount: number = 0;
  private lastEventTarget?: string;

  constructor() {
    // Restaurer le mode choisi depuis le stockage local (par défaut SSE)
    try {
      const savedMode = localStorage.getItem('3m_auto_refresh_mode') as AutoRefreshInterval;
      if (savedMode && ['sse', '15', '30', '60', 'off'].includes(savedMode)) {
        this.mode = savedMode;
      }
    } catch {}

    // Démarrage initial différé pour laisser l'application charger ses données
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.applyMode();
      }, 1000);
    }
  }

  // Obtenir l'état courant
  getStatus(): RealtimeStatus {
    return {
      mode: this.mode,
      connected: this.connected,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      lastEventTarget: this.lastEventTarget
    };
  }

  // Modifier le mode de rafraîchissement
  setMode(newMode: AutoRefreshInterval): void {
    if (this.mode === newMode) return;
    this.mode = newMode;
    try {
      localStorage.setItem('3m_auto_refresh_mode', newMode);
    } catch {}
    this.applyMode();
    this.notifyStatus();
  }

  // Souscrire aux notifications de synchronisation de données
  onSync(cb: SyncCallback): () => void {
    this.syncListeners.add(cb);
    return () => this.syncListeners.delete(cb);
  }

  // Souscrire aux changements d'état de connexion
  onStatusChange(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.getStatus());
    return () => this.statusListeners.delete(cb);
  }

  // Déclencher un rafraîchissement manuel immédiat
  triggerManualRefresh(): void {
    this.lastSyncTime = new Date();
    this.syncCount++;
    this.notifySync('manual');
    this.notifyStatus();
  }

  // Appliquer le mode choisi
  private applyMode(): void {
    this.stopSSE();
    this.stopPolling();

    if (this.mode === 'sse') {
      this.startSSE();
    } else if (this.mode !== 'off') {
      const seconds = parseInt(this.mode, 10);
      if (!isNaN(seconds) && seconds > 0) {
        this.startPolling(seconds * 1000);
      }
    } else {
      this.connected = false;
      this.notifyStatus();
    }
  }

  // Démarrer la connexion Server-Sent Events (SSE)
  private startSSE(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      this.startPolling(15000);
      return;
    }

    try {
      this.eventSource = new EventSource('/api/events');

      this.eventSource.onopen = () => {
        this.connected = true;
        this.notifyStatus();
      };

      this.eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'connected') {
            this.connected = true;
            this.notifyStatus();
            return;
          }

          // Événement de mise à jour détecté depuis un autre écran ou action locale
          this.lastEventTarget = data.target || data.type;
          this.scheduleDebouncedSync(this.lastEventTarget);
        } catch {
          // Message texte brut / ping
        }
      };

      this.eventSource.onerror = () => {
        this.connected = false;
        this.notifyStatus();
        this.stopSSE();

        // Tentative de reconnexion après 5 secondes
        if (this.mode === 'sse') {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.mode === 'sse') {
              this.startSSE();
            }
          }, 5000);
        }
      };
    } catch (err) {
      console.warn('⚠️ [SSE] Impossible d\'initialiser EventSource, bascule en polling 15s', err);
      this.startPolling(15000);
    }
  }

  private stopSSE(): void {
    clearTimeout(this.reconnectTimer);
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
  }

  // Démarrer le polling périodique (15s, 30s, etc.)
  private startPolling(intervalMs: number): void {
    this.connected = true;
    this.pollingTimer = setInterval(() => {
      this.lastEventTarget = 'polling';
      this.notifySync('polling');
      this.lastSyncTime = new Date();
      this.syncCount++;
      this.notifyStatus();
    }, intervalMs);
    this.notifyStatus();
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // Éviter les rafraîchissements en rafale (coalescing sur 400ms)
  private scheduleDebouncedSync(target?: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.lastSyncTime = new Date();
      this.syncCount++;
      this.notifySync(target);
      this.notifyStatus();
    }, 400);
  }

  private notifySync(target?: string): void {
    for (const listener of this.syncListeners) {
      try {
        listener(target);
      } catch (err) {
        console.error('Erreur dans le listener de synchronisation:', err);
      }
    }
  }

  private notifyStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Erreur dans le listener de statut:', err);
      }
    }
  }
}

export const realtimeSync = new RealtimeSyncService();
