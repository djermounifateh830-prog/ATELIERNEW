import { UserProfile, UserRole } from '../types';

const STORAGE_ACTIVE_OP_KEY = '3m_active_operator_id';
const STORAGE_OPERATORS_LIST_KEY = '3m_operators_list';

export const DEFAULT_OPERATORS: UserProfile[] = [
  {
    id: 'op_resp_fateh',
    nom: 'Fateh D.',
    role: 'RESPONSABLE',
    initiales: 'FD',
    avatarColor: 'from-purple-600 to-indigo-600',
    poste: 'Responsable Atelier & Production',
    derniereActivite: 'Aujourd\'hui'
  },
  {
    id: 'op_atel_karim',
    nom: 'Karim H.',
    role: 'ATELIER',
    initiales: 'KH',
    avatarColor: 'from-amber-500 to-orange-600',
    poste: 'Opérateur Scie & Gestion Chutes',
    derniereActivite: 'En poste'
  },
  {
    id: 'op_comm_samir',
    nom: 'Samir B.',
    role: 'COMMERCIAL',
    initiales: 'SB',
    avatarColor: 'from-sky-500 to-blue-600',
    poste: 'Commercial & Bureau d\'Études',
    derniereActivite: 'En ligne'
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
    defaultTabs: ['monitoring', 'ecosysteme', 'encours', 'historique', 'stock', 'devis', 'documentation']
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
          this.operators = parsed;
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
    const nom = updates.nom !== undefined ? updates.nom.trim() : current.nom;
    const initiales = nom
      ? nom.split(' ').map(p => p[0]).filter(Boolean).join('').substring(0, 2).toUpperCase()
      : current.initiales;

    const updated: UserProfile = {
      ...current,
      ...updates,
      nom,
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
