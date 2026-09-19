export interface ColumnDef {
  id: string;
  label: string;
  defaultVisible?: boolean;
}

export type TableId =
  | 'articles'
  | 'chutes'
  | 'chutes_maille'
  | 'dossiers'
  | 'suivis_of'
  | 'of_encours'
  | 'historique'
  | 'mouvements'
  | 'fiches_transfert';

export const TABLE_COLUMNS_DEFINITIONS: Record<TableId, { title: string; columns: ColumnDef[] }> = {
  articles: {
    title: 'Tableau des Articles du Stock',
    columns: [
      { id: 'code_art', label: 'Code Article', defaultVisible: true },
      { id: 'designation', label: 'Désignation', defaultVisible: true },
      { id: 'statut', label: 'Statut', defaultVisible: true },
      { id: 'longeur', label: 'Longueur (mm)', defaultVisible: true },
      { id: 'stock_physique', label: 'Stock Physique', defaultVisible: true },
      { id: 'quantite_reservee', label: 'Qté Réservée', defaultVisible: true },
      { id: 'stock_disponible', label: 'Stock Disponible', defaultVisible: true },
      { id: 'stock_min', label: 'Stock Alerte Min', defaultVisible: true },
      { id: 'prix_unitaire', label: 'Prix Unitaire (DA)', defaultVisible: true },
      { id: 'hauteur', label: 'Hauteur (mm)', defaultVisible: false },
      { id: 'lame', label: 'Pas Lame (mm)', defaultVisible: false },
      { id: 'debordement', label: 'Débordement', defaultVisible: false },
      { id: 'refus_min', label: 'Refus Min', defaultVisible: false },
      { id: 'refus_max', label: 'Refus Max', defaultVisible: false },
      { id: 'actions', label: 'Actions / Opérations', defaultVisible: true }
    ]
  },
  chutes: {
    title: 'Tableau des Chutes de Barres',
    columns: [
      { id: 'num', label: 'N°', defaultVisible: true },
      { id: 'id', label: 'Identifiant / Code Chute', defaultVisible: false },
      { id: 'longueur', label: 'Longueur (mm)', defaultVisible: true },
      { id: 'quantite', label: 'Quantité Disponible', defaultVisible: true },
      { id: 'qualite', label: 'Qualité / État Chute', defaultVisible: true },
      { id: 'actions', label: 'Actions / Réutilisation', defaultVisible: true }
    ]
  },
  chutes_maille: {
    title: 'Tableau des Chutes de Toile Moustiquaire',
    columns: [
      { id: 'num', label: 'N°', defaultVisible: true },
      { id: 'id', label: 'Identifiant Toile', defaultVisible: false },
      { id: 'dimension', label: 'Dimension Fixe (mm)', defaultVisible: true },
      { id: 'plis', label: 'Nombre de Plis', defaultVisible: true },
      { id: 'actions', label: 'Actions', defaultVisible: true }
    ]
  },
  dossiers: {
    title: 'Tableau des Dossiers & Commandes',
    columns: [
      { id: 'id', label: 'N° Dossier', defaultVisible: true },
      { id: 'refCommande', label: 'Réf. Commande', defaultVisible: true },
      { id: 'nomClientFinal', label: 'Client Final', defaultVisible: true },
      { id: 'donneurOrdre', label: 'Donneur d\'Ordre / Agence', defaultVisible: true },
      { id: 'dateCommande', label: 'Date Commande', defaultVisible: true },
      { id: 'caisson', label: 'N° Caisson', defaultVisible: true },
      { id: 'sousFace', label: 'N° Sous-Face', defaultVisible: true },
      { id: 'tablier', label: 'N° Tablier', defaultVisible: true },
      { id: 'moustiquaire', label: 'N° Moustiquaire', defaultVisible: true },
      { id: 'statut', label: 'Statut Dossier', defaultVisible: true },
      { id: 'actions', label: 'Actions Dossier', defaultVisible: true }
    ]
  },
  historique: {
    title: 'Tableau de l\'Historique des Dossiers & Commandes',
    columns: [
      { id: 'refCommande', label: 'Réf. Commande', defaultVisible: true },
      { id: 'dateCommande', label: 'Date Commande', defaultVisible: true },
      { id: 'dateLivraison', label: 'Échéance / Délai', defaultVisible: true },
      { id: 'nomClientFinal', label: 'Client Final', defaultVisible: true },
      { id: 'donneurOrdre', label: 'Donneur d\'Ordre', defaultVisible: true },
      { id: 'famille', label: 'Famille(s)', defaultVisible: true },
      { id: 'articles', label: 'Articles / Profilés', defaultVisible: true },
      { id: 'nbArticles', label: 'Nbr Pièces (Pcs)', defaultVisible: true },
      { id: 'statut', label: 'Statut', defaultVisible: true },
      { id: 'actions', label: 'Actions', defaultVisible: true }
    ]
  },
  suivis_of: {
    title: 'Tableau des Ordres de Fabrication (OF)',
    columns: [
      { id: 'id', label: 'N° OF', defaultVisible: true },
      { id: 'date', label: 'Date & Heure Émission', defaultVisible: true },
      { id: 'dossier', label: 'N° Dossier & Réf', defaultVisible: true },
      { id: 'client', label: 'Client / Agence', defaultVisible: true },
      { id: 'famille', label: 'Famille Produit', defaultVisible: true },
      { id: 'article', label: 'Article / Profilé Débité', defaultVisible: true },
      { id: 'barres', label: 'Barres Requises', defaultVisible: true },
      { id: 'pieces', label: 'Total Pièces', defaultVisible: true },
      { id: 'chute', label: 'Chute Estimée (%)', defaultVisible: true },
      { id: 'delai', label: 'Délai / Date Livraison', defaultVisible: true },
      { id: 'operateur', label: 'Opérateur / Poste', defaultVisible: true },
      { id: 'statut', label: 'Statut OF', defaultVisible: true },
      { id: 'actions', label: 'Actions / Clôture', defaultVisible: true }
    ]
  },
  of_encours: {
    title: 'Tableau des Ordres de Fabrication en Cours (OF)',
    columns: [
      { id: 'id', label: 'N° OF', defaultVisible: true },
      { id: 'date', label: 'Date & Heure', defaultVisible: true },
      { id: 'dossier', label: 'N° Dossier & Réf', defaultVisible: true },
      { id: 'client', label: 'Client / Agence', defaultVisible: true },
      { id: 'famille', label: 'Famille Produit', defaultVisible: true },
      { id: 'article', label: 'Article / Profilé', defaultVisible: true },
      { id: 'barres', label: 'Barres Requises', defaultVisible: true },
      { id: 'pieces', label: 'Total Pièces', defaultVisible: true },
      { id: 'chute', label: 'Chute Estimée (%)', defaultVisible: true },
      { id: 'delai', label: 'Délai Livraison', defaultVisible: true },
      { id: 'operateur', label: 'Opérateur', defaultVisible: true },
      { id: 'statut', label: 'Statut OF', defaultVisible: true },
      { id: 'actions', label: 'Actions', defaultVisible: true }
    ]
  },
  mouvements: {
    title: 'Tableau de l\'Historique des Mouvements Stock',
    columns: [
      { id: 'date', label: 'Date & Heure', defaultVisible: true },
      { id: 'type', label: 'Type Opération', defaultVisible: true },
      { id: 'article', label: 'Article Débité / Entré', defaultVisible: true },
      { id: 'quantite', label: 'Quantité Mouvementée', defaultVisible: true },
      { id: 'avant', label: 'Stock Avant', defaultVisible: true },
      { id: 'apres', label: 'Stock Après', defaultVisible: true },
      { id: 'motif', label: 'N° OF / Motif / Référence', defaultVisible: true },
      { id: 'operateur', label: 'Opérateur', defaultVisible: true }
    ]
  },
  fiches_transfert: {
    title: 'Tableau des Fiches de Transfert & Bons de Livraison',
    columns: [
      { id: 'numero', label: 'N° Fiche', defaultVisible: true },
      { id: 'date', label: 'Date Création', defaultVisible: true },
      { id: 'dossier', label: 'Dossier / Réf', defaultVisible: true },
      { id: 'client', label: 'Destinataire / Client', defaultVisible: true },
      { id: 'articles', label: 'Articles & Colis', defaultVisible: true },
      { id: 'statut', label: 'Statut Fiche', defaultVisible: true },
      { id: 'actions', label: 'Actions / Impression', defaultVisible: true }
    ]
  }
};

const STORAGE_KEY = '3m_tables_columns_config';

type ColumnVisibilityMap = Record<string, Record<string, boolean>>;

class ColumnConfigService {
  private config: ColumnVisibilityMap = {};
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.config = JSON.parse(stored);
      }
    } catch {
      this.config = {};
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {}
    this.notify();
  }

  public isColumnVisible(tableId: TableId, columnId: string): boolean {
    const tableConf = this.config[tableId];
    if (tableConf && tableConf[columnId] !== undefined) {
      return tableConf[columnId];
    }
    // Fallback sur defaultVisible de la définition
    const def = TABLE_COLUMNS_DEFINITIONS[tableId]?.columns.find(c => c.id === columnId);
    return def ? (def.defaultVisible !== false) : true;
  }

  public getVisibleColumns(tableId: TableId): string[] {
    const cols = TABLE_COLUMNS_DEFINITIONS[tableId]?.columns || [];
    return cols.filter(c => this.isColumnVisible(tableId, c.id)).map(c => c.id);
  }

  public setColumnVisible(tableId: TableId, columnId: string, visible: boolean): void {
    if (!this.config[tableId]) {
      this.config[tableId] = {};
    }
    this.config[tableId][columnId] = visible;
    this.save();
  }

  public toggleColumn(tableId: TableId, columnId: string): void {
    const current = this.isColumnVisible(tableId, columnId);
    this.setColumnVisible(tableId, columnId, !current);
  }

  public setAllColumns(tableId: TableId, visible: boolean): void {
    const cols = TABLE_COLUMNS_DEFINITIONS[tableId]?.columns || [];
    if (!this.config[tableId]) {
      this.config[tableId] = {};
    }
    cols.forEach(c => {
      // Les actions restent toujours visibles
      if (c.id === 'actions') {
        this.config[tableId][c.id] = true;
      } else {
        this.config[tableId][c.id] = visible;
      }
    });
    this.save();
  }

  public resetTable(tableId: TableId): void {
    if (this.config[tableId]) {
      delete this.config[tableId];
      this.save();
    }
  }

  public resetAll(): void {
    this.config = {};
    this.save();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error('Erreur listener colonnes:', err);
      }
    }
  }
}

export const columnConfigService = new ColumnConfigService();
