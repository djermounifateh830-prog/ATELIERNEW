import { StorageService } from './storage';
import { logger } from './logger';

export interface BackupSettings {
  enabled: boolean;
  scheduledTime: string; // "16:30"
  defaultPath: string; // "D:\\Sauvegardes_3M\\" ou "Sauvegardes_3M_Atelier"
  lastBackupDate: string | null; // "2026-09-18"
  lastBackupTime: string | null; // "16:30:00"
  lastBackupFilename: string | null; // "3m_atelier_backup_2026-09-21_12h00m00.db"
  backupFormat: 'db' | 'json';
}

const STORAGE_KEY = '3m_backup_settings';

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: true,
  scheduledTime: '16:30',
  defaultPath: 'Sauvegardes_3M_Atelier',
  lastBackupDate: null,
  lastBackupTime: null,
  lastBackupFilename: null,
  backupFormat: 'db'
};

type BackupListener = (settings: BackupSettings) => void;

class AutoBackupService {
  private settings: BackupSettings = { ...DEFAULT_BACKUP_SETTINGS };
  private listeners: Set<BackupListener> = new Set();
  private checkInterval: any = null;

  constructor() {
    this.load();
    this.startScheduler();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_BACKUP_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      this.settings = { ...DEFAULT_BACKUP_SETTINGS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {}
    this.notify();
  }

  public getSettings(): BackupSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<BackupSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.save();
  }

  private startScheduler(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Vérification toutes les 30 secondes
    this.checkInterval = setInterval(() => {
      this.checkAndExecuteScheduledBackup();
    }, 30000);
  }

  private checkAndExecuteScheduledBackup(): void {
    if (!this.settings.enabled) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;

    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;

    // Si la sauvegarde n'a pas encore été effectuée aujourd'hui
    // et que l'heure actuelle est supérieure ou égale à l'heure programmée
    if (this.settings.lastBackupDate !== todayStr && currentTimeStr >= this.settings.scheduledTime) {
      this.executeBackup(true).catch(err => {
        console.warn('[AutoBackup] Sauvegarde automatique reportée ou impossible:', err);
      });
    }
  }

  public async executeSilentBackup(): Promise<{ filename: string; fullPath: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('/api/db/backup-silent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultPath: this.settings.defaultPath,
          prefix: '3m_atelier_backup'
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Erreur serveur HTTP ${res.status} lors de la sauvegarde silencieuse`);
      }

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Échec de la sauvegarde silencieuse');
      }

      this.settings.lastBackupDate = result.date;
      this.settings.lastBackupTime = result.time;
      this.settings.lastBackupFilename = result.filename;
      this.save();

      const logMsg = `Sauvegarde automatique silencieuse effectuée avec succès sans écrasement : ${result.filename} dans [${result.fullPath}].`;
      logger.action('Sauvegarde Base', logMsg);

      return { filename: result.filename, fullPath: result.fullPath };
    } catch (err: any) {
      console.warn('Sauvegarde silencieuse serveur indisponible, sauvegarde de secours locale...', err?.message || err);
      
      // En cas d'indisponibilité du serveur (hors-ligne, sandbox iframe ou réseau restreint), 
      // créer un instantané de secours local pour sécuriser les données de l'atelier
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentDay = String(now.getDate()).padStart(2, '0');
      const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;
      const timeFormatted = now.toTimeString().split(' ')[0];
      const fallbackFilename = `3m_atelier_backup_local_${todayStr}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}m.json`;

      try {
        const fullData = await StorageService.initSqlite();
        localStorage.setItem('3m_last_local_backup', JSON.stringify({
          timestamp: new Date().toISOString(),
          filename: fallbackFilename,
          data: fullData
        }));

        this.settings.lastBackupDate = todayStr;
        this.settings.lastBackupTime = timeFormatted;
        this.settings.lastBackupFilename = fallbackFilename;
        this.save();

        logger.action('Sauvegarde Base', `Sauvegarde locale de secours enregistrée (${fallbackFilename}).`);
        return { filename: fallbackFilename, fullPath: 'Stockage local navigateur (Secours)' };
      } catch (localErr: any) {
        // Enregistrer la tentative pour éviter de boucler toutes les 30s
        this.settings.lastBackupDate = todayStr;
        this.save();
        logger.warn('Sauvegarde Base', `Sauvegarde automatique suspendue : ${err.message || 'Serveur indisponible'}`);
        return { filename: 'erreur_sauvegarde', fullPath: '' };
      }
    }
  }

  public async executeBackup(isAutomatic = false): Promise<void> {
    if (isAutomatic) {
      // Sauvegarde silencieuse automatique : aucune boîte de dialogue, aucune confirmation
      await this.executeSilentBackup();
      return;
    }

    // Sauvegarde manuelle (téléchargement direct initié par l'utilisateur)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;
    const timeFormatted = now.toTimeString().split(' ')[0];

    const timestampName = `${todayStr}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}m${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `3m_atelier_backup_${timestampName}.${this.settings.backupFormat}`;

    try {
      if (this.settings.backupFormat === 'db') {
        // Téléchargement direct du fichier SQLite physique via l'API backend
        const res = await fetch('/api/db/download');
        if (!res.ok) {
          throw new Error(`Erreur HTTP ${res.status} lors de l'export de la base SQLite`);
        }
        const blob = await res.blob();
        this.triggerBrowserDownload(blob, filename);
      } else {
        // Format JSON complet
        const fullData = await StorageService.initSqlite();
        const jsonString = JSON.stringify(fullData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        this.triggerBrowserDownload(blob, filename);
      }

      this.settings.lastBackupDate = todayStr;
      this.settings.lastBackupTime = timeFormatted;
      this.settings.lastBackupFilename = filename;
      this.save();

      const logMsg = `Sauvegarde manuelle exportée avec succès (${filename}).`;
      logger.action('Sauvegarde Base', logMsg);
    } catch (err: any) {
      console.error('Erreur lors de la sauvegarde manuelle:', err);
      logger.error('Sauvegarde Base', `Échec de la sauvegarde : ${err.message}`);
      throw err;
    }
  }

  private triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  public subscribe(listener: BackupListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l(this.getSettings());
      } catch (err) {
        console.error('Erreur listener backup:', err);
      }
    }
  }
}

export const autoBackupService = new AutoBackupService();
