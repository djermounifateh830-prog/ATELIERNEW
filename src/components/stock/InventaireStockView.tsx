import React, { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  Search,
  PackagePlus,
  PackageMinus,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
  Save,
  RotateCcw,
  Sparkles,
  Layers,
  Check,
  X
} from 'lucide-react';
import { Article, MouvementStock } from '../../types';
import { StorageService } from '../../services/storage';
import { OperationStockType } from './OperationsStockModal';

interface InventaireStockViewProps {
  articles: Article[];
  onStockUpdated: () => void;
  onOpenOperationModal: (type: OperationStockType, art?: Article | null) => void;
}

export const InventaireStockView: React.FC<InventaireStockViewProps> = ({
  articles,
  onStockUpdated,
  onOpenOperationModal
}) => {
  const [search, setSearch] = useState<string>('');
  const [selectedFamille, setSelectedFamille] = useState<string>('TOUS');
  const [onlyEcarts, setOnlyEcarts] = useState<boolean>(false);

  // État local des comptages physiques saisis par l'utilisateur
  // Map code_art -> quantité constatée
  const [comptages, setComptages] = useState<Record<string, number>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);

  // Déterminer la famille d'un article à partir de sa désignation ou code
  const detecterFamille = (art: Article): string => {
    const des = (art.designation || '').toUpperCase();
    const code = (art.code_art || '').toUpperCase();

    if (des.includes('CAISSON') || des.includes('CT ') || code.includes('CT')) return 'CAISSON';
    if (des.includes('SOUS-FACE') || des.includes('SOUS FACE') || des.includes('SF ') || code.includes('SF')) return 'SOUS_FACE';
    if (des.includes('TABLIER') || des.includes('LAME 43') || des.includes('LAME 55') || des.includes('TBL') || code.includes('TBL') || code.includes('LA43') || code.includes('LA55')) return 'TABLIER';
    if (des.includes('FINALE') || des.includes('LF ') || code.includes('LF')) return 'LAME_FINALE';
    if (des.includes('COULISSE') || des.includes('GL ') || code.includes('GL')) return 'COULISSE';
    if (des.includes('MOUST') || des.includes('MAILLE') || des.includes('CADRE MSTQ') || code.includes('MSTQ')) return 'MOUSTIQUAIRE';
    if (des.includes('PRECADRE') || des.includes('PRÉCADRE') || des.includes('BOUCHON') || code.includes('PRC')) return 'PRECADRE';
    return 'AUTRE';
  };

  const getComptageReel = (art: Article): number => {
    if (comptages[art.code_art] !== undefined) {
      return comptages[art.code_art];
    }
    return art.stock_physique;
  };

  const handleChangerComptage = (code_art: string, valeur: number) => {
    const valPropre = Math.max(0, isNaN(valeur) ? 0 : valeur);
    setComptages(prev => ({
      ...prev,
      [code_art]: valPropre
    }));
  };

  const handleResetComptage = (code_art: string) => {
    setComptages(prev => {
      const next = { ...prev };
      delete next[code_art];
      return next;
    });
  };

  // Filtrage des articles
  const articlesFiltres = useMemo(() => {
    return articles.filter(art => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        art.code_art.toLowerCase().includes(q) ||
        art.designation.toLowerCase().includes(q);

      if (!matchSearch) return false;

      const famille = detecterFamille(art);
      const matchFamille = selectedFamille === 'TOUS' || famille === selectedFamille;
      if (!matchFamille) return false;

      if (onlyEcarts) {
        const reel = getComptageReel(art);
        const ecart = reel - art.stock_physique;
        if (ecart === 0) return false;
      }

      return true;
    });
  }, [articles, search, selectedFamille, onlyEcarts, comptages]);

  // Statistiques globales d'inventaire
  const stats = useMemo(() => {
    let totalStockTheorique = 0;
    let totalStockConstate = 0;
    let nbArticlesAvecEcart = 0;
    let totalEcartPositif = 0;
    let totalEcartNegatif = 0;
    let nbArticlesEnAlerte = 0;

    articles.forEach(art => {
      totalStockTheorique += art.stock_physique;
      const reel = getComptageReel(art);
      totalStockConstate += reel;
      const ecart = reel - art.stock_physique;
      if (ecart > 0) {
        nbArticlesAvecEcart++;
        totalEcartPositif += ecart;
      } else if (ecart < 0) {
        nbArticlesAvecEcart++;
        totalEcartNegatif += Math.abs(ecart);
      }
      if (art.stock_physique <= (art.stock_min || 5)) {
        nbArticlesEnAlerte++;
      }
    });

    return {
      totalStockTheorique,
      totalStockConstate,
      nbArticlesAvecEcart,
      totalEcartPositif,
      totalEcartNegatif,
      nbArticlesEnAlerte
    };
  }, [articles, comptages]);

  const nowFormatted = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Ajustement d'un article individuel
  const handleValiderAjustementIndividuel = async (art: Article) => {
    const reel = getComptageReel(art);
    const ecart = reel - art.stock_physique;

    if (ecart === 0) {
      setFeedback({
        message: `Aucun écart constaté pour "${art.designation}" (stock déjà à ${art.stock_physique} barres).`,
        type: 'warn'
      });
      return;
    }

    setSavingCode(art.code_art);
    try {
      const updated = articles.map(a =>
        a.code_art === art.code_art ? { ...a, stock_physique: reel } : a
      );

      await StorageService.saveArticles(updated);

      const mvt: MouvementStock = {
        id: `MVT-INV-${Date.now()}`,
        date: nowFormatted(),
        type: 'AJUSTEMENT_INVENTAIRE',
        articleCode: art.code_art,
        designation: art.designation,
        longueurMm: art.longeur,
        quantite: ecart,
        remarque: `Inventaire physique atelier : stock théorique passé de ${art.stock_physique} à ${reel} barres (Écart : ${ecart > 0 ? `+${ecart}` : ecart} barres)`
      };

      await StorageService.addMouvement(mvt);
      handleResetComptage(art.code_art);
      onStockUpdated();

      setFeedback({
        message: `✓ Inventaire mis à jour pour "${art.designation}" : nouveau stock fixé à ${reel} barres (${ecart > 0 ? `+${ecart}` : ecart}).`,
        type: 'success'
      });
    } catch (err: any) {
      setFeedback({
        message: `Erreur lors de la mise à jour : ${err.message || 'Erreur inconnue'}`,
        type: 'error'
      });
    } finally {
      setSavingCode(null);
    }
  };

  // Validation groupée de tous les écarts saisis
  const handleValiderTousLesEcarts = async () => {
    const ecartsAjuster: { art: Article; reel: number; ecart: number }[] = [];

    articles.forEach(art => {
      if (comptages[art.code_art] !== undefined) {
        const reel = comptages[art.code_art];
        const ecart = reel - art.stock_physique;
        if (ecart !== 0) {
          ecartsAjuster.push({ art, reel, ecart });
        }
      }
    });

    if (ecartsAjuster.length === 0) {
      setFeedback({
        message: "Aucun écart d'inventaire en attente de régularisation. Modifiez les quantités constatées dans le tableau pour appliquer un ajustement.",
        type: 'warn'
      });
      return;
    }

    if (!confirm(`Confirmez-vous l'ajustement d'inventaire de ${ecartsAjuster.length} article(s) ? Les stocks en base SQLite seront régularisés immédiatement.`)) {
      return;
    }

    setIsSavingAll(true);
    try {
      const artMap = new Map(articles.map(a => [a.code_art, a]));

      for (const item of ecartsAjuster) {
        const a = artMap.get(item.art.code_art);
        if (a) {
          a.stock_physique = item.reel;
        }
      }

      const updated = Array.from(artMap.values());
      await StorageService.saveArticles(updated);

      // Créer les mouvements d'ajustement
      for (const item of ecartsAjuster) {
        const mvt: MouvementStock = {
          id: `MVT-INV-${Date.now()}-${item.art.code_art}`,
          date: nowFormatted(),
          type: 'AJUSTEMENT_INVENTAIRE',
          articleCode: item.art.code_art,
          designation: item.art.designation,
          longueurMm: item.art.longeur,
          quantite: item.ecart,
          remarque: `Inventaire groupé atelier : stock passé de ${item.art.stock_physique} à ${item.reel} barres (${item.ecart > 0 ? `+${item.ecart}` : item.ecart} barres)`
        };
        await StorageService.addMouvement(mvt);
      }

      setComptages({});
      onStockUpdated();

      setFeedback({
        message: `✓ Inventaire régularisé avec succès : ${ecartsAjuster.length} article(s) mis à jour dans la base SQLite.`,
        type: 'success'
      });
    } catch (err: any) {
      setFeedback({
        message: `Erreur lors de la validation groupée : ${err.message || 'Erreur inconnue'}`,
        type: 'error'
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 uppercase tracking-wide">
                <span>Contrôle d'Inventaire Physique &amp; Flux Matière</span>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-500/40">
                  Temps Réel
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Saisissez les quantités réelles constatées dans vos racks pour régulariser le stock physique et tracer les écarts.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onOpenOperationModal('RECEPTION')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>📥 Réception Marchandise</span>
            </button>

            <button
              onClick={() => onOpenOperationModal('SORTIE')}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition cursor-pointer"
            >
              <PackageMinus className="w-4 h-4" />
              <span>📤 Sortie Manuelle</span>
            </button>

            <button
              onClick={handleValiderTousLesEcarts}
              disabled={isSavingAll || stats.nbArticlesAvecEcart === 0}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black rounded-lg flex items-center gap-2 shadow-md transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Appliquer tous les écarts ({stats.nbArticlesAvecEcart})</span>
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : feedback.type === 'warn'
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Articles Gérés</span>
            <span className="text-lg font-black text-slate-100 font-mono">{articles.length}</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Stock Théorique</span>
            <span className="text-lg font-black text-slate-200 font-mono">{stats.totalStockTheorique} <span className="text-[10px] text-slate-400 font-sans font-normal">barres</span></span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Stock Constaté</span>
            <span className="text-lg font-black text-sky-300 font-mono">{stats.totalStockConstate} <span className="text-[10px] text-slate-400 font-sans font-normal">barres</span></span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Articles à Ajuster</span>
            <span className={`text-lg font-black font-mono ${stats.nbArticlesAvecEcart > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
              {stats.nbArticlesAvecEcart}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Excédent Global</span>
            <span className="text-lg font-black text-emerald-400 font-mono">+{stats.totalEcartPositif}</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Déficit / Manquant</span>
            <span className="text-lg font-black text-rose-400 font-mono">-{stats.totalEcartNegatif}</span>
          </div>
        </div>
      </div>

      {/* 3. Filtres et Recherche */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher par code article ou désignation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Familles d'articles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'TOUS', label: 'Tous' },
            { id: 'CAISSON', label: 'Caissons' },
            { id: 'SOUS_FACE', label: 'Sous-Faces' },
            { id: 'TABLIER', label: 'Tabliers' },
            { id: 'LAME_FINALE', label: 'Lames Finales' },
            { id: 'COULISSE', label: 'Coulisses' },
            { id: 'MOUSTIQUAIRE', label: 'Moustiquaires' },
            { id: 'PRECADRE', label: 'Précadres' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFamille(f.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedFamille === f.id
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Checkbox Écarts uniquement */}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none px-2 py-1 bg-slate-950 rounded-lg border border-slate-800">
          <input
            type="checkbox"
            checked={onlyEcarts}
            onChange={e => setOnlyEcarts(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
          />
          <span>Écarts uniquement ({stats.nbArticlesAvecEcart})</span>
        </label>
      </div>

      {/* 4. Table d'Inventaire */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-200">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Code Article</th>
                <th className="py-2.5 px-3">Désignation</th>
                <th className="py-2.5 px-3 text-center">Longueur</th>
                <th className="py-2.5 px-3 text-center">Stock Alerte</th>
                <th className="py-2.5 px-3 text-center bg-slate-900/80">Stock Théorique</th>
                <th className="py-2.5 px-3 text-center bg-sky-950/40 border-x border-sky-500/20">Comptage Physique Réel</th>
                <th className="py-2.5 px-3 text-center">Écart</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {articlesFiltres.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucun article ne correspond aux critères de recherche.
                  </td>
                </tr>
              ) : (
                articlesFiltres.map(art => {
                  const reel = getComptageReel(art);
                  const ecart = reel - art.stock_physique;
                  const isModified = comptages[art.code_art] !== undefined && ecart !== 0;

                  return (
                    <tr
                      key={art.code_art}
                      className={`hover:bg-slate-800/40 transition ${
                        isModified ? 'bg-sky-950/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                        {art.code_art}
                      </td>

                      <td className="py-2.5 px-3 font-medium text-slate-100">
                        {art.designation}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {art.longeur ? `${art.longeur} mm` : '-'}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          art.stock_physique <= (art.stock_min || 5)
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                            : 'text-slate-400'
                        }`}>
                          {art.stock_min || 5}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold bg-slate-900/60">
                        <span className={art.stock_physique <= 0 ? 'text-rose-400' : 'text-slate-200'}>
                          {art.stock_physique}
                        </span>
                      </td>

                      {/* Champ de Saisie Comptage Réel Constaté */}
                      <td className="py-2 px-3 text-center bg-sky-950/30 border-x border-sky-500/20">
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleChangerComptage(art.code_art, reel - 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold cursor-pointer"
                            title="Diminuer de 1"
                          >
                            -
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={reel}
                            onChange={e => handleChangerComptage(art.code_art, parseInt(e.target.value, 10))}
                            className={`w-16 bg-slate-950 border rounded text-center py-1 text-xs font-black font-mono focus:outline-none focus:ring-1 ${
                              isModified
                                ? 'border-sky-400 text-sky-200 ring-1 ring-sky-400'
                                : 'border-slate-700 text-slate-100 focus:ring-sky-500'
                            }`}
                          />

                          <button
                            type="button"
                            onClick={() => handleChangerComptage(art.code_art, reel + 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold cursor-pointer"
                            title="Augmenter de 1"
                          >
                            +
                          </button>

                          {isModified && (
                            <button
                              type="button"
                              onClick={() => handleResetComptage(art.code_art)}
                              className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer ml-1"
                              title="Annuler la modification de comptage"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Écart Constaté */}
                      <td className="py-2.5 px-3 text-center font-mono">
                        {ecart === 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800/80 text-slate-400">
                            0
                          </span>
                        ) : ecart > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                            +{ecart}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-950/80 text-rose-300 border border-rose-500/40">
                            {ecart}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isModified ? (
                            <button
                              type="button"
                              disabled={savingCode === art.code_art}
                              onClick={() => handleValiderAjustementIndividuel(art)}
                              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-bold flex items-center gap-1 shadow transition cursor-pointer"
                              title="Valider immédiatement cet ajustement d'inventaire"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Valider</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenOperationModal('INVENTAIRE', art)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition cursor-pointer"
                              title="Détails inventaire & motif"
                            >
                              Ajuster
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenOperationModal('RECEPTION', art)}
                            className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/60 rounded cursor-pointer"
                            title="Réception Marchandise (+)"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenOperationModal('SORTIE', art)}
                            className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded cursor-pointer"
                            title="Sortie Manuelle (-)"
                          >
                            <PackageMinus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
