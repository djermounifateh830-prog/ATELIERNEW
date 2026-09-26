import { UserProfile, UserRole, UserPermissions } from '../types';

const STORAGE_ACTIVE_OP_KEY = '3m_active_operator_id';
const STORAGE_OPERATORS_LIST_KEY = '3m_operators_list';
const STORAGE_SECURITY_ENABLED_KEY = '3m_security_pin_enabled';
const STORAGE_SESSION_LOCKED_KEY = '3m_session_locked';

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<UserRole, UserPermissions> = {
  RESPONSABLE: {
    tabMonitoring: true,
    tabEcosysteme: true,
    tabEncours: true,
    tabHistorique: true,
    tabStock: true,
    tabDevis: true,
    tabDocumentation: true,
    tabParametres: true,
    canCloseOF: true,
    canCancelOF: true,
    canModifyStock: true,
    canManageChutes: true,
    canImportExport: true,
    canManageUsers: true
  },
  ATELIER: {
    tabMonitoring: true,
    tabEcosysteme: false,
    tabEncours: true,
    tabHistorique: true,
    tabStock: true,
    tabDevis: false,
    tabDocumentation: true,
    tabParametres: false,
    canCloseOF: true,
    canCancelOF: false,
    canModifyStock: true,
    canManageChutes: true,
    canImportExport: false,
    canManageUsers: false
  },
  COMMERCIAL: {
    tabMonitoring: false,
    tabEcosysteme: true,
    tabEncours: false,
    tabHistorique: true,
    tabStock: false,
    tabDevis: true,
    tabDocumentation: true,
    tabParametres: false,
    canCloseOF: false,
    canCancelOF: false,
    canModifyStock: false,
    canManageChutes: false,
    canImportExport: true,
    canManageUsers: false
  }
};

export const DEFAULT_OPERATORS: UserProfile[] = [
  {
    id: 'op_resp_fateh',
    nom: 'Fateh D.',
    role: 'RESPONSABLE',
    initiales: 'FD',
    avatarColor: 'from-purple-600 to-indigo-600',
    poste: 'Concepteur & Responsable Atelier',
    derniereActivite: 'En ligne',
    pinCode: '1234',
    isOwner: true,
    isImmutable: true,
    permissions: { ...DEFAULT_PERMISSIONS_BY_ROLE.RESPONSABLE }
  },
  {
    id: 'op_atel_karim',
    nom: 'Karim H.',
    role: 'ATELIER',
    initiales: 'KH',
    avatarColor: 'from-amber-500 to-orange-600',
    poste: 'Opérateur Scie & Gestion Chutes',
    derniereActivite: 'En poste',
    pinCode: '0000',
    permissions: { ...DEFAULT_PERMISSIONS_BY_ROLE.ATELIER }
  },
  {
    id: 'op_comm_samir',
    nom: 'Samir B.',
    role: 'COMMERCIAL',
    initiales: 'SB',
    avatarColor: 'from-sky-500 to-blue-600',
    poste: 'Commercial & Bureau d\'Études',
    derniereActivite: 'En ligne',
    pinCode: '1111',
    permissions: { ...DEFAULT_PERMISSIONS_BY_ROLE.COMMERCIAL }
  }
];

export const ROLE_CONFIG: Record<UserRole, {
  label: string;
  badgeLabel: string;
  emoji: string;
  badgeClasses: string;
  dotColor: string;
  description: string;
  defaultTabs: string[];
}> = {
  RESPONSABLE: {
    label: 'Responsable Atelier / Admin',
    badgeLabel: '👑 RESPONSABLE',
    emoji: '👑',
    badgeClasses: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    dotColor: 'bg-purple-400',
    description: 'Accès complet : Supervision globale, cadences, validation, maintenance SQLite et gestion des autorisations.',
    defaultTabs: ['monitoring', 'ecosysteme', 'encours', 'historique', 'stock', 'devis', 'documentation', 'parametres']
  },
  ATELIER: {
    label: 'Opérateur Atelier / Découpe',
    badgeLabel: '⚙️ ATELIER',
    emoji: '⚙️',
    badgeClasses: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    dotColor: 'bg-amber-400',
    description: 'Pilotage de fabrication : Débit des profilés, Cockpit de Clôture, inventaire chutes et mouvements de stock.',
    defaultTabs: ['encours', 'monitoring', 'stock']
  },
  COMMERCIAL: {
    label: 'Commercial / Bureau d\'Études',
    badgeLabel: '💼 COMMERCIAL',
    emoji: '💼',
    badgeClasses: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    dotColor: 'bg-sky-400',
    description: 'Gestion commerciale : Saisie des commandes, calcul des délais de livraison, devis et fiches de transfert.',
    defaultTabs: ['ecosysteme', 'devis', 'historique']
  }
};

type OperatorListener = (op: UserProfile) => void;

class UserService {
  private operators: UserProfile[] = [];
  private activeOperator: UserProfile;
  private listeners: Set<OperatorListener> = new Set();

  constructor() {
    this.loadOperators();
    this.activeOperator = this.resolveActiveOperator();
  }

  private loadOperators(): void {
    try {
      const stored = localStorage.getItem(STORAGE_OPERATORS_LIST_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Garantir que chaque opérateur a ses permissions et pinCode
          let list: UserProfile[] = parsed.map(op => {
            const isOwner = op.id === 'op_resp_fateh' || op.isOwner;
            const role = isOwner ? 'RESPONSABLE' : ((op.role || 'ATELIER') as UserRole);
            const defaultPerms = DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE.ATELIER;
            return {
              ...op,
              role,
              isOwner: Boolean(isOwner),
              isImmutable: Boolean(isOwner || op.isImmutable),
              pinCode: op.pinCode || (role === 'RESPONSABLE' ? '1234' : '0000'),
              permissions: isOwner
                ? { ...DEFAULT_PERMISSIONS_BY_ROLE.RESPONSABLE }
                : {
                    ...defaultPerms,
                    ...(op.permissions || {})
                  }
            };
          });

          // GARANTIE ANTI-VOL & ANTI-ÉVICTION : Si le compte Propriétaire (Fateh D.) a été supprimé frauduleusement, le réinjecter en tête
          const hasOwner = list.some(o => o.id === 'op_resp_fateh' || o.isOwner);
          if (!hasOwner) {
            list.unshift({ ...DEFAULT_OPERATORS[0] });
          }

          this.operators = list;
          this.persistOperators();
          return;
        }
      }
    } catch {}
    this.operators = [...DEFAULT_OPERATORS];
    this.persistOperators();
  }

  private persistOperators(): void {
    try {
      localStorage.setItem(STORAGE_OPERATORS_LIST_KEY, JSON.stringify(this.operators));
    } catch {}
  }

  private resolveActiveOperator(): UserProfile {
    try {
      const activeId = localStorage.getItem(STORAGE_ACTIVE_OP_KEY);
      if (activeId) {
        const found = this.operators.find(o => o.id === activeId);
        if (found) return found;
      }
    } catch {}
    return this.operators[0] || DEFAULT_OPERATORS[0];
  }

  // --- SÉCURITÉ DE SESSION & CODE PIN ---
  isSecurityPinEnabled(): boolean {
    try {
      const val = localStorage.getItem(STORAGE_SECURITY_ENABLED_KEY);
      // Par défaut activé pour garantir l'accès sécurisé demandé
      return val === null ? true : val === 'true';
    } catch {
      return true;
    }
  }

  setSecurityPinEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(STORAGE_SECURITY_ENABLED_KEY, String(enabled));
    } catch {}
    this.notifyListeners();
  }

  isSessionLocked(): boolean {
    if (!this.isSecurityPinEnabled()) return false;
    try {
      const val = localStorage.getItem(STORAGE_SESSION_LOCKED_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  lockSession(): void {
    try {
      localStorage.setItem(STORAGE_SESSION_LOCKED_KEY, 'true');
    } catch {}
    this.notifyListeners();
  }

  unlockSession(enteredPin: string): { success: boolean; message?: string } {
    const active = this.getActiveOperator();
    const correctPin = active.pinCode || (active.role === 'RESPONSABLE' ? '1234' : '0000');
    
    // Master Passkeys & PINs de secours pour le concepteur/administrateur : 3333, 9876, 1234, MASTER
    const cleanInput = enteredPin.trim();
    if (
      cleanInput === correctPin ||
      cleanInput === '3333' ||
      cleanInput === '9876' ||
      cleanInput === '1234' ||
      cleanInput === '3M-MASTER-FATEH-2026' ||
      cleanInput.toUpperCase() === 'MASTER3M'
    ) {
      try {
        localStorage.setItem(STORAGE_SESSION_LOCKED_KEY, 'false');
      } catch {}
      this.notifyListeners();
      return { success: true };
    }
    return { success: false, message: 'Code PIN incorrect. Veuillez réessayer.' };
  }

  // --- GESTION DES PERMISSIONS PAR CHECKBOX ---
  getUserPermissions(user?: UserProfile): UserPermissions {
    const target = user || this.activeOperator;
    const role = target.role || 'ATELIER';
    const defaults = DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE.ATELIER;
    return {
      ...defaults,
      ...(target.permissions || {})
    };
  }

  hasPermission(key: keyof UserPermissions, user?: UserProfile): boolean {
    const perms = this.getUserPermissions(user);
    return Boolean(perms[key]);
  }

  hasTabAccess(tabId: string, user?: UserProfile): boolean {
    const perms = this.getUserPermissions(user);
    switch (tabId) {
      case 'monitoring': return perms.tabMonitoring;
      case 'ecosysteme': return perms.tabEcosysteme;
      case 'encours': return perms.tabEncours;
      case 'cloture': return perms.tabEncours && perms.canCloseOF;
      case 'historique': return perms.tabHistorique;
      case 'stock': return perms.tabStock;
      case 'devis': return perms.tabDevis;
      case 'documentation': return perms.tabDocumentation;
      case 'parametres': return perms.tabParametres ?? perms.canManageUsers ?? (user?.role === 'RESPONSABLE');
      default: return true;
    }
  }

  updatePermissions(userId: string, newPermissions: Partial<UserPermissions>): UserProfile | null {
    const index = this.operators.findIndex(o => o.id === userId);
    if (index === -1) return null;

    const current = this.operators[index];
    const updatedPerms: UserPermissions = {
      ...this.getUserPermissions(current),
      ...newPermissions
    };

    const updatedUser: UserProfile = {
      ...current,
      permissions: updatedPerms
    };

    this.operators[index] = updatedUser;
    this.persistOperators();

    if (this.activeOperator.id === userId) {
      this.activeOperator = updatedUser;
    }
    this.notifyListeners();
    return updatedUser;
  }

  resetPermissionsToRole(userId: string): UserProfile | null {
    const index = this.operators.findIndex(o => o.id === userId);
    if (index === -1) return null;
    const current = this.operators[index];
    const defaultPerms = DEFAULT_PERMISSIONS_BY_ROLE[current.role] || DEFAULT_PERMISSIONS_BY_ROLE.ATELIER;
    return this.updatePermissions(userId, defaultPerms);
  }

  setUserPin(userId: string, pin: string): UserProfile | null {
    const index = this.operators.findIndex(o => o.id === userId);
    if (index === -1) return null;
    const cleanPin = pin.trim().replace(/\D/g, '').slice(0, 8);
    this.operators[index].pinCode = cleanPin || '0000';
    this.persistOperators();
    if (this.activeOperator.id === userId) {
      this.activeOperator = this.operators[index];
    }
    this.notifyListeners();
    return this.operators[index];
  }

  getOperators(): UserProfile[] {
    return [...this.operators];
  }

  getActiveOperator(): UserProfile {
    return this.activeOperator;
  }

  setActiveOperator(id: string): UserProfile {
    const found = this.operators.find(o => o.id === id);
    if (!found) return this.activeOperator;

    this.activeOperator = found;
    try {
      localStorage.setItem(STORAGE_ACTIVE_OP_KEY, id);
    } catch {}
    this.notifyListeners();
    return this.activeOperator;
  }

  updateOperator(id: string, updates: Partial<UserProfile>): UserProfile | null {
    const index = this.operators.findIndex(o => o.id === id);
    if (index === -1) return null;

    const current = this.operators[index];
    const isOwner = current.id === 'op_resp_fateh' || current.isOwner;

    // Si c'est le profil propriétaire, verrouiller son rôle RESPONSABLE et son statut
    const role: UserRole = isOwner ? 'RESPONSABLE' : (updates.role || current.role);
    const nom = updates.nom !== undefined ? updates.nom.trim() : current.nom;
    const initiales = nom
      ? nom.split(' ').map(p => p[0]).filter(Boolean).join('').substring(0, 2).toUpperCase()
      : current.initiales;

    const updated: UserProfile = {
      ...current,
      ...updates,
      nom: isOwner && !updates.nom ? current.nom : nom,
      role,
      isOwner: Boolean(isOwner),
      isImmutable: Boolean(isOwner || current.isImmutable),
      initiales
    };

    this.operators[index] = updated;
    this.persistOperators();

    if (this.activeOperator.id === id) {
      this.activeOperator = updated;
      this.notifyListeners();
    }

    return updated;
  }

  addOperator(nom: string, role: UserRole, poste?: string): UserProfile {
    const cleanNom = nom.trim();
    const initiales = cleanNom
      .split(' ')
      .map(p => p[0])
      .filter(Boolean)
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'OP';

    const colors: Record<UserRole, string> = {
      RESPONSABLE: 'from-purple-600 to-pink-600',
      ATELIER: 'from-amber-600 to-red-600',
      COMMERCIAL: 'from-teal-600 to-sky-600'
    };

    const newOp: UserProfile = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nom: cleanNom,
      role,
      initiales,
      avatarColor: colors[role] || 'from-slate-600 to-slate-800',
      poste: poste?.trim() || ROLE_CONFIG[role].label,
      derniereActivite: 'Nouveau'
    };

    this.operators.push(newOp);
    this.persistOperators();
    return newOp;
  }

  deleteOperator(id: string): boolean {
    if (this.operators.length <= 1) return false;
    
    // Protection absolue du compte propriétaire (Fateh D.)
    const target = this.operators.find(o => o.id === id);
    if (target && (target.id === 'op_resp_fateh' || target.isOwner || target.isImmutable)) {
      console.warn('Action refusée : Le compte Concepteur & Propriétaire ne peut pas être supprimé.');
      return false;
    }

    this.operators = this.operators.filter(o => o.id !== id);
    this.persistOperators();

    if (this.activeOperator.id === id) {
      this.setActiveOperator(this.operators[0].id);
    }
    return true;
  }

  onOperatorChange(cb: OperatorListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.activeOperator);
      } catch (err) {
        console.error('Erreur listener opérateur:', err);
      }
    }
  }
}

export const userService = new UserService();
