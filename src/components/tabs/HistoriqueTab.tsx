import React, { useState, useMemo, useEffect } from 'react';
import {
  History,
  Search,
  Calendar,
  User,
  FileText,
  Trash2,
  Copy,
  Edit3,
  Printer,
  CheckCircle,
  Clock,
  Layers,
  Scissors,
  Sliders,
  Building2,
  FolderOpen,
  Filter,
  Eye,
  Table,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Zap
} from 'lucide-react';
import { DossierCommandeGlobal, SuiviOF } from '../../types';
import { StorageService } from '../../services/storage';
import { DelaisProductionService } from '../../services/delaisProductionService';
import { DossierDetailModal } from '../common/DossierDetailModal';
import { ColumnCustomizerPopover } from '../common/ColumnCustomizerPopover';
import { columnConfigService } from '../../services/columnConfigService';

interface HistoriqueTabProps {
  dossiers?: DossierCommandeGlobal[];
  onLoadDossierInEcosysteme: (dossier: DossierCommandeGlobal) => void;
  onRefreshData?: () => void;
}

type SortColumn = 'dateCommande' | 'refCommande' | 'nomClientFinal' | 'dateLivraison' | 'nbArticles' | 'statut';

export const HistoriqueTab: React.FC<HistoriqueTabProps> = ({
  dossiers = [],
  onLoadDossierInEcosysteme,
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('TOUS');
  const [suivisOF, setSuivisOF] = useState<SuiviOF[]>([]);

  // Mode d'affichage confortable pour grands volumes (Tableau compact par défaut ou Cartes)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Tri des dossiers
  const [sortColumn, setSortColumn] = useState<SortColumn>('dateCommande');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination pour confort de défilement sur grands volumes
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [, setColumnsUpdateTrigger] = useState(0);

  useEffect(() => {
    return columnConfigService.subscribe(() => {
      setColumnsUpdateTrigger(prev => prev + 1);
    });
  }, []);

  // Modal Visualisation Complète du Dossier
  const [selectedDossierToView, setSelectedDossierToView] = useState<DossierCommandeGlobal | null>(null);
  const [isDossierDetailOpen, setIsDossierDetailOpen] = useState<boolean>(false);

  // Modal OF (Rechargement dans l'Écosystème)
  const [selectedOFDossier, setSelectedOFDossier] = useState<DossierCommandeGlobal | null>(null);
  const [isOFModalOpen, setIsOFModalOpen] = useState<boolean>(false);

  useEffect(() => {
    StorageService.getSuivisOF().then(setSuivisOF).catch(() => {});
  }, [dossiers]);

  // Réinitialiser la pagination lors d'un changement de filtre ou de recherche
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const getDossierTotalArticles = (d: DossierCommandeGlobal) => {
    const qC = (d.articlesCaissons || []).reduce((sum, c) => sum + (Number(c.quantite) || 1), 0);
    const qT = (d.articlesTabliers || []).reduce((sum, t) => sum + (Number(t.quantite) || 1), 0);
    const qM = (d.articlesMoustiquaires || []).reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
    const qP = (d.articlesPrecadres || []).reduce((sum, p) => sum + (Number(p.quantite) || 1), 0);
    return qC + qT + qM + qP;
  };

  const getDossierDateLivraison = (d: DossierCommandeGlobal) => {
    return (
      d.dateLivraisonPrevisionnelle ||
      DelaisProductionService.estimerDelaiDossier(d, dossiers, suivisOF).dateLivraisonFormattee ||
      '—'
    );
  };

  const filteredAndSortedDossiers = useMemo(() => {
    const filtered = dossiers.filter(d => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) {
        return statusFilter === 'TOUS' || d.statut === statusFilter;
      }

      // Recherche dans les métadonnées globales du dossier
      const matchMeta =
        d.refCommande.toLowerCase().includes(term) ||
        d.nomClientFinal.toLowerCase().includes(term) ||
        d.donneurOrdre.toLowerCase().includes(term) ||
        (d.notes && d.notes.toLowerCase().includes(term));

      // Recherche par sous-commandes
      const distinctRefs = [
        d.numCommandeCaisson,
        d.numCommandeSousFace,
        d.numCommandeTablier,
        d.numCommandeMoustiquaire,
        d.numCommandePrecadre
      ].filter(Boolean) as string[];
      const matchSubRefs = distinctRefs.some(r => r.toLowerCase().includes(term));

      // Recherche par REPÈRE DE LIGNE COMMANDE (pour l'opérateur caisson et atelier)
      const matchRepereCaisson = (d.articlesCaissons || []).some(c =>
        (c.repere || '').toLowerCase().includes(term) ||
        (c.articleDesignation || c.sfArticleDesignation || '').toLowerCase().includes(term)
      );
      const matchRepereTablier = (d.articlesTabliers || []).some(t =>
        (t.repere || '').toLowerCase().includes(term)
      );
      const matchRepereMstq = (d.articlesMoustiquaires || []).some(m =>
        (m.repere || '').toLowerCase().includes(term)
      );
      const matchReperePrecadre = (d.articlesPrecadres || []).some(p =>
        (p.repere || '').toLowerCase().includes(term)
      );

      const matchRepere = matchRepereCaisson || matchRepereTablier || matchRepereMstq || matchReperePrecadre;
      const matchSearch = matchMeta || matchSubRefs || matchRepere;
      const matchStatus = statusFilter === 'TOUS' || d.statut === statusFilter;

      return matchSearch && matchStatus;
    });

    // Tri dynamique
    return filtered.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      switch (sortColumn) {
        case 'refCommande':
          valA = a.refCommande || '';
          valB = b.refCommande || '';
          break;
        case 'nomClientFinal':
          valA = a.nomClientFinal || '';
          valB = b.nomClientFinal || '';
          break;
        case 'statut':
          valA = a.statut || '';
          valB = b.statut || '';
          break;
        case 'nbArticles':
          valA = getDossierTotalArticles(a);
          valB = getDossierTotalArticles(b);
          break;
        case 'dateLivraison':
          valA = getDossierDateLivraison(a);
          valB = getDossierDateLivraison(b);
          break;
        case 'dateCommande':
        default:
          valA = a.dateCommande || '';
          valB = b.dateCommande || '';
          break;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [dossiers, searchTerm, statusFilter, sortColumn, sortDirection, suivisOF]);

  // Dossiers paginés
  const totalItems = filteredAndSortedDossiers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const displayedDossiers = useMemo(() => {
    if (pageSize >= 9999) return filteredAndSortedDossiers;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedDossiers.slice(start, start + pageSize);
  }, [filteredAndSortedDossiers, currentPage, pageSize]);

  const handleSupprimerDossier = async (id: string, ref: string) => {
    if (confirm(`Voulez-vous vraiment supprimer définitivement le dossier ${ref} de l'historique ?`)) {
      const updated = dossiers.filter(d => d.id !== id);
      await StorageService.saveDossiers(updated);
      if (onRefreshData) onRefreshData();
    }
  };

  const handleDupliquerDossier = async (d: DossierCommandeGlobal) => {
    const newRef = `${d.refCommande}-COPIE`;
    const newDossier: DossierCommandeGlobal = {
      ...d,
      id: 'd-' + Date.now(),
      refCommande: newRef,
      dateCommande: new Date().toLocaleDateString('fr-FR'),
      notes: `Dupliqué depuis ${d.refCommande}. ${d.notes || ''}`.trim()
    };
    const updated = [newDossier, ...dossiers];
    await StorageService.saveDossiers(updated);
    if (onRefreshData) onRefreshData();
  };

  const handleOpenDossierDetail = (dossier: DossierCommandeGlobal) => {
    setSelectedDossierToView(dossier);
    setIsDossierDetailOpen(true);
  };

  const handleOpenOFModal = (dossier: DossierCommandeGlobal) => {
    setSelectedOFDossier(dossier);
    setIsOFModalOpen(true);
  };

  const stats = useMemo(() => {
    let nbCaissons = 0;
    let nbTabliers = 0;
    let nbMoustiquaires = 0;
    let nbPrecadres = 0;

    dossiers.forEach(d => {
      (d.articlesCaissons || []).forEach(c => { nbCaissons += (Number(c.quantite) || 1); });
      (d.articlesTabliers || []).forEach(t => { nbTabliers += (Number(t.quantite) || 1); });
      (d.articlesMoustiquaires || []).forEach(m => { nbMoustiquaires += (Number(m.quantite) || 1); });
      (d.articlesPrecadres || []).forEach(p => { nbPrecadres += (Number(p.quantite) || 1); });
    });

    return {
      totalDossiers: dossiers.length,
      nbCaissons,
      nbTabliers,
      nbMoustiquaires,
      nbPrecadres
    };
  }, [dossiers]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Historique Global des Commandes &amp; Dossiers</span>
              <span className="bg-purple-500/20 text-purple-300 text-xs px-2.5 py-0.5 rounded-full border border-purple-500/30 font-mono">
                {dossiers.length} dossier(s)
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Recherchez, consultez, réouvrez ou réimprimez n'importe quelle commande enregistrée dans l'atelier.
            </p>
          </div>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1 rounded-lg bg-slate-950 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>{stats.nbCaissons} Caissons</span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-slate-950 border border-sky-500/30 text-sky-300 flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5" />
            <span>{stats.nbTabliers} Tabliers</span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-slate-950 border border-amber-500/30 text-amber-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            <span>{stats.nbMoustiquaires} Mstq</span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-slate-950 border border-purple-500/30 text-purple-300 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>{stats.nbPrecadres} Précadres</span>
          </span>
        </div>
      </div>

      {/* Filter, Search & View Mode Toolbar */}
      <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Rechercher par Repère de pièce (ex: CF1, DF2...), N° commande, Client, Donneur d'ordre..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                title="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre Statut */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-purple-300 font-bold focus:outline-none"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="EN_ATTENTE">En attente</option>
              <option value="EN_COURS">En cours de fabrication</option>
              <option value="CLOTURE">Clôturé / Prêt livraison</option>
              <option value="LIVRE">Livré (Fiche de Transfert)</option>
              <option value="TERMINE">Terminé</option>
            </select>
          </div>

          {/* Sélecteur Nombre par page (Confort grands volumes) */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-700 text-xs">
            <span className="text-slate-400 text-[11px]">Afficher :</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={9999}>Tout</option>
            </select>
          </div>

          {/* Toggle Vue Tableau vs Vue Cartes */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs font-bold rounded flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Vue Tableau Compact (Recommandée pour grand volume de commandes)"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tableau</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 text-xs font-bold rounded flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Vue Cartes Détaillées"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cartes</span>
            </button>
          </div>

          <ColumnCustomizerPopover tableId="historique" />
        </div>
      </div>

      {/* Barre de pagination & résumé des résultats */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 px-1">
        <div>
          <span>Affichage de </span>
          <strong className="text-white">
            {totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </strong>
          <span> à </span>
          <strong className="text-white">
            {Math.min(currentPage * pageSize, totalItems)}
          </strong>
          <span> sur </span>
          <strong className="text-amber-400 font-mono">{totalItems}</strong>
          <span> commande(s) trouvée(s)</span>
          {searchTerm && <span className="text-purple-300 ml-1">(filtrées par « {searchTerm} »)</span>}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 font-mono text-xs bg-slate-900 border border-slate-700 rounded-lg text-amber-300 font-bold">
              Page {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Page suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Vue Tableau Compact (Optimal pour grand volume) */}
      {displayedDossiers.length === 0 ? (
        <div className="bg-slate-900/50 p-12 rounded-2xl border border-slate-800 text-center space-y-3">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">Aucun dossier de commande trouvé</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'TOUS'
              ? "Aucun résultat ne correspond à vos critères de recherche. Essayez de réinitialiser les filtres."
              : "Aucune commande n'est encore enregistrée dans l'historique de l'atelier."}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-300 border-b border-slate-800 font-bold select-none">
                <tr>
                  {columnConfigService.isColumnVisible('historique', 'refCommande') && (
                    <th
                      onClick={() => handleSort('refCommande')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Réf. Commande</span>
                        {sortColumn === 'refCommande' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'dateCommande') && (
                    <th
                      onClick={() => handleSort('dateCommande')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Date Commande</span>
                        {sortColumn === 'dateCommande' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'dateLivraison') && (
                    <th
                      onClick={() => handleSort('dateLivraison')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Échéance / Délai</span>
                        {sortColumn === 'dateLivraison' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'nomClientFinal') && (
                    <th
                      onClick={() => handleSort('nomClientFinal')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Client Final</span>
                        {sortColumn === 'nomClientFinal' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'donneurOrdre') && (
                    <th className="py-3 px-3">Donneur d'Ordre</th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'nbArticles') && (
                    <th
                      onClick={() => handleSort('nbArticles')}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Articles / Pièces</span>
                        {sortColumn === 'nbArticles' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'statut') && (
                    <th
                      onClick={() => handleSort('statut')}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Statut</span>
                        {sortColumn === 'statut' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfigService.isColumnVisible('historique', 'actions') && (
                    <th className="py-3 px-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {displayedDossiers.map((dossier, idx) => {
                  const nbCaisson = (dossier.articlesCaissons || []).reduce((sum, c) => sum + (Number(c.quantite) || 1), 0);
                  const nbTablier = (dossier.articlesTabliers || []).reduce((sum, t) => sum + (Number(t.quantite) || 1), 0);
                  const nbMstq = (dossier.articlesMoustiquaires || []).reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
                  const nbPrecadre = (dossier.articlesPrecadres || []).reduce((sum, p) => sum + (Number(p.quantite) || 1), 0);
                  const totalArticles = nbCaisson + nbTablier + nbMstq + nbPrecadre;
                  const dateLiv = getDossierDateLivraison(dossier);

                  // Repères trouvés si recherche active
                  const term = searchTerm.toLowerCase().trim();
                  const matchedRepere = term
                    ? [
                        ...(dossier.articlesCaissons || []).filter(c => (c.repere || '').toLowerCase().includes(term)).map(c => `📦 ${c.repere}`),
                        ...(dossier.articlesTabliers || []).filter(t => (t.repere || '').toLowerCase().includes(term)).map(t => `🪟 ${t.repere}`),
                        ...(dossier.articlesMoustiquaires || []).filter(m => (m.repere || '').toLowerCase().includes(term)).map(m => `🦟 ${m.repere}`),
                        ...(dossier.articlesPrecadres || []).filter(p => (p.repere || '').toLowerCase().includes(term)).map(p => `🚪 ${p.repere}`)
                      ]
                    : [];

                  return (
                    <tr
                      key={dossier.id}
                      className={`hover:bg-slate-850/80 transition ${
                        idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/80'
                      }`}
                    >
                      {/* Réf. Commande */}
                      {columnConfigService.isColumnVisible('historique', 'refCommande') && (
                        <td className="py-2.5 px-3 font-mono">
                          <div className="flex flex-col gap-1 items-start">
                            <button
                              type="button"
                              onClick={() => handleOpenDossierDetail(dossier)}
                              className="font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1 transition cursor-pointer shadow-xs"
                              title="Cliquer pour visualiser tous les détails de cette commande"
                            >
                              <span>{dossier.refCommande}</span>
                              <Eye className="w-3 h-3 text-amber-400 opacity-60" />
                            </button>
                            {dossier.estPrioritaire && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                                <Zap className="w-2.5 h-2.5 fill-rose-400 text-rose-400" />
                                <span>Prioritaire</span>
                              </span>
                            )}
                            {matchedRepere.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {matchedRepere.slice(0, 3).map((r, i) => (
                                  <span key={i} className="text-[10px] bg-purple-950 text-purple-300 border border-purple-500/40 px-1 py-0.2 rounded font-bold">
                                    {r}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Date Commande */}
                      {columnConfigService.isColumnVisible('historique', 'dateCommande') && (
                        <td className="py-2.5 px-3 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{dossier.dateCommande}</span>
                          </span>
                        </td>
                      )}

                      {/* Échéance */}
                      {columnConfigService.isColumnVisible('historique', 'dateLivraison') && (
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>{dateLiv}</span>
                          </span>
                        </td>
                      )}

                      {/* Client Final */}
                      {columnConfigService.isColumnVisible('historique', 'nomClientFinal') && (
                        <td className="py-2.5 px-3 font-semibold text-slate-100 max-w-[180px] truncate" title={dossier.nomClientFinal}>
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate">{dossier.nomClientFinal}</span>
                          </div>
                        </td>
                      )}

                      {/* Donneur d'Ordre */}
                      {columnConfigService.isColumnVisible('historique', 'donneurOrdre') && (
                        <td className="py-2.5 px-3 text-sky-300 font-medium max-w-[150px] truncate" title={dossier.donneurOrdre}>
                          {dossier.donneurOrdre || '—'}
                        </td>
                      )}

                      {/* Articles / Pièces */}
                      {columnConfigService.isColumnVisible('historique', 'nbArticles') && (
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1 font-mono text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white font-bold" title="Total lignes articles">
                              {totalArticles} pcs
                            </span>
                            {nbCaisson > 0 && (
                              <span className="px-1 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px]" title={`${nbCaisson} caisson(s)`}>
                                {nbCaisson}C
                              </span>
                            )}
                            {nbTablier > 0 && (
                              <span className="px-1 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-500/30 text-[10px]" title={`${nbTablier} volet(s)`}>
                                {nbTablier}V
                              </span>
                            )}
                            {nbMstq > 0 && (
                              <span className="px-1 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30 text-[10px]" title={`${nbMstq} moustiquaire(s)`}>
                                {nbMstq}M
                              </span>
                            )}
                            {nbPrecadre > 0 && (
                              <span className="px-1 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/30 text-[10px]" title={`${nbPrecadre} précadre(s)`}>
                                {nbPrecadre}P
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Statut */}
                      {columnConfigService.isColumnVisible('historique', 'statut') && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                              dossier.statut === 'LIVRE'
                                ? 'bg-blue-950 text-blue-300 border-blue-500/40'
                                : dossier.statut === 'CLOTURE'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                                : dossier.statut === 'FABRIQUE' || (dossier.statut as string) === 'TERMINE'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                                : dossier.statut === 'EN_COURS'
                                ? 'bg-amber-950 text-amber-300 border-amber-500/30'
                                : 'bg-purple-950 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            {dossier.statut === 'LIVRE'
                              ? '🚚 LIVRÉ'
                              : dossier.statut === 'CLOTURE'
                              ? '✅ CLÔTURÉ'
                              : dossier.statut === 'FABRIQUE' || (dossier.statut as string) === 'TERMINE'
                              ? '🏭 FABRIQUÉ'
                              : dossier.statut === 'EN_COURS'
                              ? '⚙️ EN COURS'
                              : '⏳ EN ATTENTE'}
                          </span>
                        </td>
                      )}

                      {/* Actions */}
                      {columnConfigService.isColumnVisible('historique', 'actions') && (
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Bouton Visualiser Complète */}
                            <button
                              type="button"
                              onClick={() => handleOpenDossierDetail(dossier)}
                              className="px-2 py-1 bg-purple-950/80 hover:bg-purple-900 text-purple-300 hover:text-purple-100 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border border-purple-700/60 shadow-xs"
                              title="Visualiser le détail complet de la commande"
                            >
                              <Eye className="w-3 h-3 text-purple-400" />
                              <span>Visualiser</span>
                            </button>

                            {/* Charger dans Écosystème */}
                            <button
                              type="button"
                              onClick={() => onLoadDossierInEcosysteme(dossier)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs transition cursor-pointer"
                              title="Charger et modifier dans l'Écosystème"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                            </button>

                            {/* Imprimer OF */}
                            <button
                              type="button"
                              onClick={() => handleOpenOFModal(dossier)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs transition cursor-pointer"
                              title="Imprimer Ordre de Fabrication (OF)"
                            >
                              <Printer className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {/* Dupliquer */}
                            <button
                              type="button"
                              onClick={() => handleDupliquerDossier(dossier)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs transition cursor-pointer"
                              title="Dupliquer le dossier"
                            >
                              <Copy className="w-3.5 h-3.5 text-sky-400" />
                            </button>

                            {/* Supprimer */}
                            <button
                              type="button"
                              onClick={() => handleSupprimerDossier(dossier.id, dossier.refCommande)}
                              className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-md text-xs transition cursor-pointer"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Vue Cartes (Détaillée) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedDossiers.map(dossier => {
            const nbCaisson = (dossier.articlesCaissons || []).reduce((sum, c) => sum + (Number(c.quantite) || 1), 0);
            const nbTablier = (dossier.articlesTabliers || []).reduce((sum, t) => sum + (Number(t.quantite) || 1), 0);
            const nbMstq = (dossier.articlesMoustiquaires || []).reduce((sum, m) => sum + (Number(m.quantite) || 1), 0);
            const nbPrecadre = (dossier.articlesPrecadres || []).reduce((sum, p) => sum + (Number(p.quantite) || 1), 0);
            const totalArticles = nbCaisson + nbTablier + nbMstq + nbPrecadre;

            return (
              <div
                key={dossier.id}
                className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 hover:border-purple-500/40 transition shadow-lg space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  {/* Top Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-black text-amber-300 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-500/30">
                        {dossier.refCommande}
                      </span>
                      <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {dossier.dateCommande}
                      </span>
                      {(() => {
                        const dateAffichee = dossier.dateLivraisonPrevisionnelle || DelaisProductionService.estimerDelaiDossier(dossier, dossiers, suivisOF).dateLivraisonFormattee;
                        return (
                          <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>{dateAffichee}</span>
                          </span>
                        );
                      })()}
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        dossier.statut === 'LIVRE'
                          ? 'bg-blue-950 text-blue-300 border border-blue-500/40'
                          : dossier.statut === 'CLOTURE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : dossier.statut === 'FABRIQUE' || (dossier.statut as string) === 'TERMINE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                          : dossier.statut === 'EN_COURS'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                          : 'bg-purple-950 text-purple-300 border border-purple-500/30'
                      }`}
                    >
                      {dossier.statut === 'LIVRE'
                        ? '🚚 LIVRÉ'
                        : dossier.statut === 'CLOTURE'
                        ? '✅ CLÔTURÉ'
                        : dossier.statut === 'FABRIQUE' || (dossier.statut as string) === 'TERMINE'
                        ? '🏭 FABRIQUÉ'
                        : dossier.statut === 'EN_COURS'
                        ? '⚙️ EN COURS'
                        : '⏳ EN ATTENTE'}
                    </span>
                  </div>

                  {/* Client Info */}
                  <div className="text-xs space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" /> Client Final :
                      </span>
                      <strong className="text-slate-100 font-bold">{dossier.nomClientFinal}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Donneur d'Ordre :</span>
                      <span className="text-sky-300 font-semibold">{dossier.donneurOrdre}</span>
                    </div>

                    {/* Liste des N° de commandes incluses dans ce dossier */}
                    {(() => {
                      const distinctRefs = Array.from(new Set([
                        dossier.refCommande,
                        dossier.numCommandeCaisson,
                        dossier.numCommandeSousFace,
                        dossier.numCommandeTablier,
                        dossier.numCommandeMoustiquaire,
                        dossier.numCommandePrecadre,
                        ...(dossier.articlesCaissons || []).flatMap(c => [c.refCommande, c.sfRefCommande]),
                        ...(dossier.articlesTabliers || []).map(t => t.refCommande),
                        ...(dossier.articlesMoustiquaires || []).map(m => m.refCommande),
                        ...(dossier.articlesPrecadres || []).map(p => p.refCommande)
                      ].filter(Boolean)));

                      if (distinctRefs.length <= 1) return null;
                      return (
                        <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-amber-400 font-bold">Commandes du dossier :</span>
                          {distinctRefs.map(ref => (
                            <span key={ref} className="text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                              N° {ref}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Products breakdown */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    {nbCaisson > 0 && (
                      <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                        {nbCaisson} caisson(s)
                      </span>
                    )}
                    {nbTablier > 0 && (
                      <span className="bg-sky-950/80 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded">
                        {nbTablier} tablier(s)
                      </span>
                    )}
                    {nbMstq > 0 && (
                      <span className="bg-amber-950/80 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                        {nbMstq} moustiquaire(s)
                      </span>
                    )}
                    {nbPrecadre > 0 && (
                      <span className="bg-purple-950/80 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
                        {nbPrecadre} précadre(s)
                      </span>
                    )}
                    {totalArticles === 0 && (
                      <span className="text-slate-500 italic">Dossier vide</span>
                    )}
                  </div>

                  {/* Délais calculés par commande / famille pour ce dossier */}
                  {(() => {
                    const datesCommandes = dossier.datesLivraisonCommandes;
                    if (datesCommandes && Object.keys(datesCommandes).length > 1) {
                      return (
                        <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-slate-400">Échéances par commande :</span>
                          {Object.entries(datesCommandes).map(([fam, info]) => (
                            <span
                              key={fam}
                              className="bg-slate-900 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1"
                              title={`${fam}: ${info.nbPieces} pcs, délai: ${info.delaiJours}j`}
                            >
                              <span className="font-bold text-slate-200">
                                {fam === 'CAISSON' ? 'Caisson' : fam === 'PRECADRE' ? 'Précadre' : fam === 'TABLIER' ? 'Volet' : 'Moust.'}
                              </span>
                              {info.numCommande && <span className="text-slate-400">({info.numCommande})</span>}
                              : <span className="text-sky-300 font-bold">{info.dateLivraison}</span>
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Mise en avant des repères trouvés lors d'une recherche par repère */}
                  {searchTerm && (() => {
                    const term = searchTerm.toLowerCase().trim();
                    const matchedCaissons = (dossier.articlesCaissons || []).filter(c => (c.repere || '').toLowerCase().includes(term));
                    const matchedTabliers = (dossier.articlesTabliers || []).filter(t => (t.repere || '').toLowerCase().includes(term));
                    const matchedMstq = (dossier.articlesMoustiquaires || []).filter(m => (m.repere || '').toLowerCase().includes(term));
                    const matchedPrecadres = (dossier.articlesPrecadres || []).filter(p => (p.repere || '').toLowerCase().includes(term));
                    const totalMatches = matchedCaissons.length + matchedTabliers.length + matchedMstq.length + matchedPrecadres.length;

                    if (totalMatches === 0) return null;

                    return (
                      <div className="bg-amber-950/40 border border-amber-500/50 rounded-lg p-2 text-xs space-y-1">
                        <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                          <span>🎯 Repère(s) trouvé(s) pour « {searchTerm} » :</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 font-mono">
                          {matchedCaissons.map((c, i) => (
                            <span key={'c-' + i} className="bg-emerald-950 text-emerald-200 border border-emerald-500/50 px-2 py-0.5 rounded font-black text-[11px]">
                              📦 Caisson: {c.repere} ({c.longueur}mm)
                            </span>
                          ))}
                          {matchedTabliers.map((t, i) => (
                            <span key={'t-' + i} className="bg-sky-950 text-sky-200 border border-sky-500/50 px-2 py-0.5 rounded font-black text-[11px]">
                              🪟 Volet: {t.repere} ({t.largeur}×{t.hauteur}mm)
                            </span>
                          ))}
                          {matchedMstq.map((m, i) => (
                            <span key={'m-' + i} className="bg-amber-950 text-amber-200 border border-amber-500/50 px-2 py-0.5 rounded font-black text-[11px]">
                              🦟 Mstq: {m.repere} ({m.largeur}×{m.hauteur}mm)
                            </span>
                          ))}
                          {matchedPrecadres.map((p, i) => (
                            <span key={'p-' + i} className="bg-purple-950 text-purple-200 border border-purple-500/50 px-2 py-0.5 rounded font-black text-[11px]">
                              🚪 Précadre: {p.repere} ({p.largeur}×{p.hauteur}mm)
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {dossier.notes && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-950/50 p-2 rounded border border-slate-850">
                      "{dossier.notes}"
                    </p>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenDossierDetail(dossier)}
                      className="px-2.5 py-1.5 bg-purple-950/80 hover:bg-purple-900 text-purple-300 hover:text-purple-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-purple-700/60 shadow cursor-pointer"
                      title="Visualiser le détail complet de la commande"
                    >
                      <Eye className="w-3.5 h-3.5 text-purple-400" />
                      <span>Visualiser</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoadDossierInEcosysteme(dossier)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
                      title="Charger et modifier dans l'Écosystème"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Charger</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenOFModal(dossier)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition cursor-pointer"
                      title="Imprimer Ordre de Fabrication (OF)"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDupliquerDossier(dossier)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition cursor-pointer"
                      title="Dupliquer le dossier"
                    >
                      <Copy className="w-3.5 h-3.5 text-sky-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupprimerDossier(dossier.id, dossier.refCommande)}
                      className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg text-xs transition cursor-pointer"
                      title="Supprimer du dossier"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Visualisation Complète du Dossier */}
      {selectedDossierToView && (
        <DossierDetailModal
          isOpen={isDossierDetailOpen}
          dossier={selectedDossierToView}
          onClose={() => {
            setIsDossierDetailOpen(false);
            setSelectedDossierToView(null);
          }}
          onLoadInEcosysteme={d => {
            setIsDossierDetailOpen(false);
            setSelectedDossierToView(null);
            onLoadDossierInEcosysteme(d);
          }}
        />
      )}

      {/* OF Modal — depuis l'Historique, il faut recharger le dossier dans l'Ecosystème pour imprimer l'OF complet */}
      {selectedOFDossier && isOFModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl text-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center text-slate-950 font-black text-xs">3M</div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100">Ordre de Fabrication</h2>
                  <p className="text-xs text-slate-400 font-mono">{selectedOFDossier.refCommande} • {selectedOFDossier.nomClientFinal}</p>
                </div>
              </div>
              <button
                onClick={() => { setIsOFModalOpen(false); setSelectedOFDossier(null); }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex items-start gap-3">
              <span className="text-amber-400 text-lg shrink-0">ℹ️</span>
              <div className="text-xs text-amber-200 space-y-2">
                <p className="font-bold text-sm text-amber-300">Impression OF depuis l'Historique</p>
                <p>
                  Pour imprimer ou télécharger l'Ordre de Fabrication (OF) de ce dossier,
                  <strong className="text-white"> chargez d'abord le dossier dans l'Écosystème Commandes</strong>,
                  puis relancez l'optimisation. Les coupes calculées seront alors disponibles dans l'OF imprimable.
                </p>
                <p className="text-amber-400/70">
                  Les données d'un OF déjà émis peuvent être consultées dans l'onglet <strong className="text-white">Suivi OF</strong>.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Dossier N° :</span>
                <span className="text-amber-300 font-bold">{selectedOFDossier.refCommande}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Client :</span>
                <span className="text-slate-200 font-bold">{selectedOFDossier.nomClientFinal}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Donneur d'ordre :</span>
                <span className="text-sky-300">{selectedOFDossier.donneurOrdre}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Date :</span>
                <span className="text-slate-300">{selectedOFDossier.dateCommande}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Pièces (total) :</span>
                <span className="text-emerald-300 font-bold">
                  {getDossierTotalArticles(selectedOFDossier)} pièce(s)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onLoadDossierInEcosysteme(selectedOFDossier);
                setIsOFModalOpen(false);
                setSelectedOFDossier(null);
              }}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow transition cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Charger dans l'Écosystème → Multi-Optimiser → Imprimer l'OF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
