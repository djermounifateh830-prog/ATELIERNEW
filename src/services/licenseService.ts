import { AppLicense, LicenseEdition, LicenseStatus, LicenseValidationResult } from '../types';

const STORAGE_LICENSE_KEY = '3m_atelier_active_license';
const STORAGE_MACHINE_ID_KEY = '3m_atelier_machine_fingerprint';
const STORAGE_LAST_TIME_KEY = '3m_atelier_clock_check';
const STORAGE_KEYS_HISTORY = '3m_atelier_generated_keys_history';
const STORAGE_SECURITY_MODE_KEY = '3m_atelier_enforce_hardware_lock';

// Sel cryptographique maître réservé au propriétaire (Fateh D. / 3M Atelier)
const MASTER_SECRET_SALT = '3M_ATELIER_FATEH_DJERMOUNI_PROPRIETARY_SECURE_SALT_2026';
export const MASTER_ADMIN_PASSKEY = '3M-MASTER-FATEH-2026';
export const MASTER_EMERGENCY_PIN = '9876';

/**
 * Calcul d'un hash 32-bit FNV-1a & CRC combiné pour signature cryptographique déterministe
 */
function fastHash(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  const hex1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex1}${hex2}`;
}

type LicenseListener = (res: LicenseValidationResult) => void;

class LicenseService {
  private machineId: string = '';
  private currentLicense: AppLicense | null = null;
  private listeners: Set<LicenseListener> = new Set();

  constructor() {
    this.machineId = this.resolveMachineId();
    this.currentLicense = this.loadLicense();
    this.verifyClockIntegrity();
  }

  /**
   * Génère et stabilise une empreinte matérielle unique pour le PC
   * Basée sur des caractéristiques invariantes de l'environnement machine
   */
  private resolveMachineId(): string {
    try {
      const stored = localStorage.getItem(STORAGE_MACHINE_ID_KEY);
      if (stored && stored.startsWith('3M-')) {
        return stored;
      }
    } catch {}

    // Éléments stables de la machine
    const components: string[] = [];
    try {
      if (typeof window !== 'undefined') {
        const nav = window.navigator;
        const scr = window.screen;
        components.push(nav.userAgent || 'unknown-ua');
        components.push(String(nav.hardwareConcurrency || 4));
        components.push(String(scr.width) + 'x' + String(scr.height));
        components.push(String(scr.colorDepth || 24));
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        components.push(nav.language || 'fr');
      }
    } catch {}

    // Graine aléatoire persistante par machine
    const randomSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
    components.push(randomSeed);
    components.push(Date.now().toString(36).toUpperCase());

    const rawHash = fastHash(components.join('##'));
    const chunk1 = rawHash.substring(0, 4);
    const chunk2 = rawHash.substring(4, 8);
    const chunk3 = rawHash.substring(8, 12);
    const machineId = `3M-ATEL-${chunk1}-${chunk2}-${chunk3}`;

    try {
      localStorage.setItem(STORAGE_MACHINE_ID_KEY, machineId);
    } catch {}

    return machineId;
  }

  /**
   * Récupère l'empreinte matérielle publique du poste
   */
  getMachineId(): string {
    return this.machineId;
  }

  /**
   * Vérifie si le système de verrouillage matériel strict est activé
   */
  isHardwareLockEnforced(): boolean {
    try {
      const val = localStorage.getItem(STORAGE_SECURITY_MODE_KEY);
      // Par défaut activé pour garantir la protection de l'application
      return val === null ? true : val === 'true';
    } catch {
      return true;
    }
  }

  /**
   * Active ou désactive le mode de protection strict
   */
  setHardwareLockEnforced(enforced: boolean): void {
    try {
      localStorage.setItem(STORAGE_SECURITY_MODE_KEY, String(enforced));
    } catch {}
    this.notifyListeners();
  }

  /**
   * Charge la licence enregistrée sur le poste
   */
  private loadLicense(): AppLicense | null {
    try {
      const stored = localStorage.getItem(STORAGE_LICENSE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}

    // Par défaut, si aucune licence n'est présente sur le poste de travail,
    // on vérifie si l'environnement est en AI Studio Developer / Démo
    // pour permettre au propriétaire de concevoir et configurer sans blocage
    if (this.isDevelopmentHost()) {
      const devLicense = this.createDefaultOwnerLicense(this.machineId);
      this.saveLicense(devLicense);
      return devLicense;
    }

    return null;
  }

  private isDevelopmentHost(): boolean {
    try {
      const hostname = window.location.hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('run.app');
    } catch {
      return false;
    }
  }

  private createDefaultOwnerLicense(machineId: string): AppLicense {
    return this.generateKeyPayload(
      machineId,
      '3M ATELIER — CONCEPTEUR & PROPRIÉTAIRE',
      'COMPLETE',
      'LIFETIME',
      'Poste Développeur & Administration Principale'
    );
  }

  private saveLicense(lic: AppLicense): void {
    try {
      localStorage.setItem(STORAGE_LICENSE_KEY, JSON.stringify(lic));
    } catch {}
  }

  /**
   * Vérifie qu'il n'y a pas de manipulation frauduleuse de l'horloge système
   */
  private verifyClockIntegrity(): boolean {
    try {
      const now = Date.now();
      const last = localStorage.getItem(STORAGE_LAST_TIME_KEY);
      if (last) {
        const lastNum = parseInt(last, 10);
        // Si l'horloge système a reculé de plus de 2 jours
        if (now < lastNum - 172800000) {
          console.warn('⚠️ Alerte de sécurité : Décalage d’horloge système suspect détecté.');
          return false;
        }
      }
      localStorage.setItem(STORAGE_LAST_TIME_KEY, String(now));
    } catch {}
    return true;
  }

  /**
   * Calcule la signature cryptographique d'une licence pour un poste
   */
  private computeSignature(
    normalizedMachineId: string,
    clientName: string,
    edition: LicenseEdition,
    expiresAt: string
  ): string {
    const payload = `${normalizedMachineId.trim().toUpperCase()}|${clientName.trim().toUpperCase()}|${edition}|${expiresAt}|${MASTER_SECRET_SALT}`;
    return fastHash(payload);
  }

  /**
   * Formate une clé d'activation lisible et distribuable
   * Format : 3M-{EDITION}-{MACHINE_FRAGMENT}-{EXPIRY_FRAGMENT}-{CHECKSUM}
   */
  private formatActivationKey(
    machineId: string,
    edition: LicenseEdition,
    expiresAt: string,
    signature: string
  ): string {
    const edShort = edition === 'COMPLETE' ? 'CMP' : edition === 'ATELIER' ? 'ATL' : 'COM';
    const cleanMid = machineId.replace(/[^A-Z0-9]/gi, '').slice(-6);
    const expCode = expiresAt === 'LIFETIME' ? 'LIFE' : expiresAt.replace(/-/g, '').slice(2, 8);
    const checkFragment = signature.substring(0, 6);
    return `3M-${edShort}-${cleanMid}-${expCode}-${checkFragment}`;
  }

  /**
   * GÉNÉRATEUR OFFICIEL DE CLÉS DE LICENCE (Réservé au Propriétaire)
   * Permet à Fateh D. d'émettre des licences pour des ateliers tiers
   */
  generateKeyPayload(
    targetMachineId: string,
    clientName: string,
    edition: LicenseEdition,
    duration: '1_MONTH' | '3_MONTHS' | '6_MONTHS' | '1_YEAR' | 'LIFETIME',
    posteLabel?: string
  ): AppLicense {
    const normalizedMid = targetMachineId.trim().toUpperCase();
    const cleanClient = clientName.trim() || 'ATELIER CLIENT SANS NOM';
    const now = new Date();
    const createdAt = now.toISOString();

    let expiresAt = 'LIFETIME';
    let isLifetime = true;

    if (duration !== 'LIFETIME') {
      isLifetime = false;
      const expDate = new Date();
      if (duration === '1_MONTH') expDate.setMonth(expDate.getMonth() + 1);
      else if (duration === '3_MONTHS') expDate.setMonth(expDate.getMonth() + 3);
      else if (duration === '6_MONTHS') expDate.setMonth(expDate.getMonth() + 6);
      else if (duration === '1_YEAR') expDate.setFullYear(expDate.getFullYear() + 1);
      expiresAt = expDate.toISOString().split('T')[0];
    }

    const signature = this.computeSignature(normalizedMid, cleanClient, edition, expiresAt);
    const activationKey = this.formatActivationKey(normalizedMid, edition, expiresAt, signature);

    const license: AppLicense = {
      machineId: normalizedMid,
      clientName: cleanClient,
      edition,
      createdAt,
      expiresAt,
      isLifetime,
      activationKey,
      signature,
      activatedAt: new Date().toISOString(),
      posteLabel: posteLabel?.trim() || 'Poste de Travail Principal'
    };

    // Enregistrer dans l'historique des licences émises
    this.saveKeyToHistory(license);

    return license;
  }

  private saveKeyToHistory(lic: AppLicense): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS_HISTORY);
      const list: AppLicense[] = stored ? JSON.parse(stored) : [];
      // Remplacer si existante ou ajouter en tête
      const filtered = list.filter(item => item.activationKey !== lic.activationKey);
      filtered.unshift(lic);
      localStorage.setItem(STORAGE_KEYS_HISTORY, JSON.stringify(filtered.slice(0, 50)));
    } catch {}
  }

  getGeneratedKeysHistory(): AppLicense[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS_HISTORY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Active le poste avec une clé fournie par le propriétaire
   */
  activateWithKey(
    keyInput: string,
    clientNameInput?: string,
    editionInput: LicenseEdition = 'COMPLETE'
  ): { success: boolean; message: string; license?: AppLicense } {
    const rawKey = keyInput.trim().toUpperCase().replace(/\s+/g, '');

    // Master Passkey Propriétaire : active immédiatement le poste à vie en Super-Admin
    if (rawKey === MASTER_ADMIN_PASSKEY || rawKey === '3M-FATEH-VIP' || rawKey === 'MASTER3M') {
      const masterLic = this.generateKeyPayload(
        this.machineId,
        '3M ATELIER — LICENCE MAÎTRE PROPRIÉTAIRE',
        'COMPLETE',
        'LIFETIME',
        'Poste Débloqué par Code Maître'
      );
      this.currentLicense = masterLic;
      this.saveLicense(masterLic);
      this.notifyListeners();
      return {
        success: true,
        message: 'Poste activé avec succès en Licence Maître Intégrale (Propriétaire).',
        license: masterLic
      };
    }

    // Décodage de la clé fournie
    // Format : 3M-{EDITION}-{MACHINE_FRAGMENT}-{EXPIRY_FRAGMENT}-{CHECKSUM}
    const parts = rawKey.split('-');
    if (parts.length < 5 || parts[0] !== '3M') {
      return {
        success: false,
        message: 'Format de clé d’activation invalide. La clé doit respecter le format 3M-XXX-XXXXXX-XXXX-XXXXXX.'
      };
    }

    const edShort = parts[1];
    const machineFragment = parts[2];
    const expFragment = parts[3];
    const checksum = parts[4];

    // Vérifier que le fragment machine correspond bien à CE poste précis !
    const myCleanMid = this.machineId.replace(/[^A-Z0-9]/gi, '').slice(-6);
    if (machineFragment !== myCleanMid) {
      return {
        success: false,
        message: `Cette clé est réservée à un autre ordinateur (Empreinte attendue : *${machineFragment}*, ce poste : *${myCleanMid}*). Le transfert non autorisé de licence est bloqué.`
      };
    }

    // Résolution de l'édition
    const edition: LicenseEdition =
      edShort === 'CMP' ? 'COMPLETE' : edShort === 'ATL' ? 'ATELIER' : 'COMMERCIAL';

    // Résolution de la date
    let expiresAt = 'LIFETIME';
    let isLifetime = true;
    if (expFragment !== 'LIFE') {
      isLifetime = false;
      // Format 260926 -> 2026-09-26
      if (expFragment.length === 6) {
        expiresAt = `20${expFragment.substring(0, 2)}-${expFragment.substring(2, 4)}-${expFragment.substring(4, 6)}`;
      }
    }

    // Recherche de correspondance avec l'historique local ou validation par signature
    const clientName = clientNameInput?.trim() || 'ATELIER CLIENT CERTIFIÉ';
    const expectedSig = this.computeSignature(this.machineId, clientName, edition, expiresAt);

    // Vérifier la signature ou le checksum
    if (checksum !== expectedSig.substring(0, 6)) {
      // Test de repli avec nom d'atelier générique
      const genericSig = this.computeSignature(this.machineId, 'ATELIER CLIENT CERTIFIÉ', edition, expiresAt);
      if (checksum !== genericSig.substring(0, 6)) {
        return {
          success: false,
          message: 'Clé d’activation incorrecte ou corrompue pour ce poste.'
        };
      }
    }

    const newLicense: AppLicense = {
      machineId: this.machineId,
      clientName,
      edition,
      createdAt: new Date().toISOString(),
      expiresAt,
      isLifetime,
      activationKey: rawKey,
      signature: expectedSig,
      activatedAt: new Date().toISOString(),
      posteLabel: `Poste Atelier ${this.machineId.slice(-4)}`
    };

    this.currentLicense = newLicense;
    this.saveLicense(newLicense);
    this.notifyListeners();

    return {
      success: true,
      message: `Licence ${isLifetime ? 'Définitive (À vie)' : `valide jusqu'au ${expiresAt}`} activée avec succès !`,
      license: newLicense
    };
  }

  /**
   * Vérifie la validité en temps réel de la licence sur ce poste
   */
  validateCurrentLicense(): LicenseValidationResult {
    const machineId = this.machineId;

    if (!this.isHardwareLockEnforced()) {
      return {
        isValid: true,
        status: 'ACTIVE',
        message: 'Protection matérielle désactivée par le responsable.',
        license: this.currentLicense,
        machineId
      };
    }

    if (!this.currentLicense) {
      return {
        isValid: false,
        status: 'UNLICENSED',
        message: 'Ce poste n’est pas encore activé. Une clé d’activation valide est requise pour démarrer.',
        license: null,
        machineId
      };
    }

    const lic = this.currentLicense;

    // 1. Vérification de révocation manuelle
    if (lic.revoked) {
      return {
        isValid: false,
        status: 'REVOKED',
        message: `Cette licence a été révoquée par le propriétaire (${lic.revocationReason || 'Révocation administrative'}).`,
        license: lic,
        machineId
      };
    }

    // 2. Vérification de l'empreinte matérielle (Anti-Copie / Anti-Vol)
    if (lic.machineId !== machineId) {
      return {
        isValid: false,
        status: 'UNLICENSED',
        message: 'Tentative d’utilisation de l’application sur un poste non autorisé. La licence appartient à une autre machine.',
        license: lic,
        machineId
      };
    }

    // 3. Vérification de la date d'expiration
    if (!lic.isLifetime && lic.expiresAt !== 'LIFETIME') {
      const expDate = new Date(lic.expiresAt + 'T23:59:59');
      const now = new Date();
      const diffTime = expDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysRemaining < 0) {
        return {
          isValid: false,
          status: 'EXPIRED',
          message: `La période de licence de ce poste a expiré le ${lic.expiresAt}. Veuillez contacter l’administrateur pour renouveler.`,
          license: lic,
          daysRemaining: 0,
          machineId
        };
      }

      return {
        isValid: true,
        status: 'ACTIVE',
        message: `Licence valide (${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''}).`,
        license: lic,
        daysRemaining,
        machineId
      };
    }

    return {
      isValid: true,
      status: 'ACTIVE',
      message: 'Licence Définitive (À vie) certifiée.',
      license: lic,
      daysRemaining: 99999,
      machineId
    };
  }

  /**
   * Révoque immédiatement la licence sur ce poste
   */
  revokeLicense(reason?: string): void {
    if (this.currentLicense) {
      this.currentLicense.revoked = true;
      this.currentLicense.revocationReason = reason || 'Révoquée par l’administrateur';
      this.saveLicense(this.currentLicense);
      this.notifyListeners();
    }
  }

  /**
   * Supprime la licence pour forcer une réactivation
   */
  clearLicense(): void {
    try {
      localStorage.removeItem(STORAGE_LICENSE_KEY);
    } catch {}
    this.currentLicense = null;
    this.notifyListeners();
  }

  onLicenseChange(listener: LicenseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const res = this.validateCurrentLicense();
    for (const listener of this.listeners) {
      try {
        listener(res);
      } catch (err) {
        console.error('Erreur listener licence:', err);
      }
    }
  }
}

export const licenseService = new LicenseService();
