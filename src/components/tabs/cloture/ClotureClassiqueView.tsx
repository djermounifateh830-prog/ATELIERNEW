import React, { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCheck,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  Layers,
  Box,
  RefreshCw,
  Check,
  Search,
  SlidersHorizontal,
  PackageCheck,
  X,
  CheckCircle2,
  ArrowLeft,
  RotateCcw
} from 'lucide-react';
import { Article, ChuteItem, LigneRetourOF, SuiviOF, MouvementStock } from '../../../types';
import { StorageService } from '../../../services/storage';
import { ConfirmationModal } from '../../common/ConfirmationModal';

interface ClotureClassiqueViewProps {
  suivi: SuiviOF;
  articles: Article[];
  chutesBarres: Record<string, ChuteItem[]>;
  mapping: Record<string, string>;
  onRefreshData: () => void;
  onClotureSuccess?: () => void;
  onCloseOF?: () => void;
  onNavigateToTab?: (tabId: string) => void;
}

export const ClotureClassiqueView: React.FC<ClotureClassiqueViewProps> = ({
  suivi,
  articles,
  chutesBarres,
  mapping,
  onRefreshData,
  onClotureSuccess,
  onCloseOF,
  onNavigateToTab
}) => {
  const [lignes, setLignes] = useState<LigneRetourOF[]>(() => {
    return (suivi.lignesRetour || []).map(l => ({ ...l }));
  });

  const [lignesVerifiees, setLignesVerifiees] = useState<Record<number, boolean>>({});
  const [filtreLignes, setFiltreLignes] = useState<'TOUTES' | 'A_STOCKER' | 'MODIFIEES' | 'ANOMALIES'>('TOUTES');
  const [searchFilter, setSearchFilter] = useState('');
  const [remarqueGlobale, setRemarqueGlobale] = useState(suivi.remarqueGlobale || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClotureTerminee, setIsClotureTerminee] = useState(suivi.statut === 'CLOTURE');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleFermerOF = () => {
    setShowConfirmModal(false);
    if (onClotureSuccess) {
      onClotureSuccess();
    } else if (onCloseOF) {
      onCloseOF();
    } else if (onNavigateToTab) {
      onNavigateToTab('encours');
    }
  };

  const handleResetInitial = () => {
    setLignes((suivi.lignesRetour || []).map(l => ({ ...l })));
    setLignesVerifiees({});
  };

  // Mettre à jour une ligne
  const updateLigne = (idx: number, updates: Partial<LigneRetourOF>) => {
    setLignes(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
    setLignesVerifiees(prev => ({ ...prev, [idx]: true }));
  };

  // Tout valider conforme en 1 clic
  const handleToutConforme = () => {
    const verifiedMap: Record<number, boolean> = {};
    setLignes(prev =>
      prev.map((l, idx) => {
        verifiedMap[idx] = true;
        const article = articles.find(a => a.code_art === l.articleCode);
        const refusMax = article?.refus_max ?? 500;
        return {
          ...l,
          sourceReelle: 'CONFORME',
          longueurSourceReelle: l.longueurPrevue,
          resteReelMesureMm: l.restePrevuMm,
          actionReste: l.restePrevuMm >= refusMax ? 'A_STOCKER' : 'DECHET',
          saisieOperateur: ''
        };
      })
    );
    setLignesVerifiees(verifiedMap);
  };

  // Ajouter un support barre neuve
  const handleAjouterBarreNeuve = () => {
    const firstLigne = lignes[0];
    const articleCode = firstLigne?.articleCode || suivi.titreSection;
    const article = articles.find(a => a.code_art === articleCode);
    const standardLg = article?.longeur || 6000;
    const newLigne: LigneRetourOF = {
      id: `suppl-barre-${Date.now()}`,
      repere: `BARRE SUPPLÉMENTAIRE #${lignes.length + 1}`,
      typeSupport: 'BARRE_NEUVE',
      articleCode,
      articleDesignation: firstLigne?.articleDesignation || '',
      longueurPrevue: standardLg,
      restePrevuMm: standardLg,
      saisieOperateur: `BARRE 6M SUPPLÉMENTAIRE`,
      sourceReelle: 'BARRE_NEUVE',
      longueurSourceReelle: standardLg,
      resteReelMesureMm: 0,
      actionReste: 'DECHET',
      piecesInfoStr: 'Barre supplémentaire consommée pour refabrication',
      remarque: 'Barre 6m supplémentaire débitée en atelier'
    };
    setLignes(prev => [...prev, newLigne]);
    setLignesVerifiees(prev => ({ ...prev, [lignes.length]: true }));
  };

  // Filtrage des lignes
  const lignesAffichees = useMemo(() => {
    return lignes.map((ligne, originalIdx) => ({ ligne, originalIdx })).filter(({ ligne }) => {
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const repMatch = (ligne.repere || '').toLowerCase().includes(q);
        const artMatch = (ligne.articleDesignation || ligne.articleCode || '').toLowerCase().includes(q);
        const piecesMatch = (ligne.piecesInfoStr || '').toLowerCase().includes(q);
        if (!repMatch && !artMatch && !piecesMatch) return false;
      }

      if (filtreLignes === 'A_STOCKER') {
        const realReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
        return ligne.actionReste === 'A_STOCKER' && realReste > 0;
      }
      if (filtreLignes === 'MODIFIEES') {
        const realReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
        const isModif =
          (ligne.sourceReelle && ligne.sourceReelle !== 'CONFORME') ||
          realReste !== ligne.restePrevuMm ||
          Boolean(ligne.saisieOperateur);
        return isModif;
      }
      if (filtreLignes === 'ANOMALIES') {
        const realReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
        const supportLg = ligne.longueurSourceReelle || ligne.longueurPrevue;
        return realReste > supportLg || realReste < 0;
      }
      return true;
    });
  }, [lignes, filtreLignes, searchFilter]);

  // Validation finale clôture
  const handleValiderClotureClassique = async () => {
    setIsSubmitting(true);
    try {
      const todayStr = new Date().toLocaleDateString('fr-FR');
      const dateTimeStr = `${todayStr} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      const finalNumCmd = suivi.numCommande;
      const mouvements: MouvementStock[] = [];
      let mvtCounter = 0;
      const makeId = () => `mvt-cls-${Date.now()}-${mvtCounter++}`;

      lignes.forEach(ligne => {
        const isAccessoire =
          ligne.id?.startsWith('lr-acc-') ||
          ligne.repere?.startsWith('ACCESSOIRE') ||
          ligne.longueurPrevue === 0;

        if (isAccessoire) {
          let qte = 1;
          const m = ligne.piecesInfoStr?.match(/^(\d+)/) || ligne.saisieOperateur?.match(/^(\d+)/);
          if (m) qte = parseInt(m[1], 10) || 1;
          if (qte > 0 && ligne.articleCode) {
            mouvements.push({
              id: makeId(),
              date: dateTimeStr,
              type: 'SORTIE_ACCESSOIRE',
              articleCode: ligne.articleCode,
              designation: ligne.articleDesignation,
              ofId: suivi.id,
              numCommande: finalNumCmd,
              nomClient: suivi.nomClient,
              longueurMm: 0,
              quantite: qte,
              remarque: `Sortie accessoire (${qte} pcs) — OF ${suivi.codeOF || finalNumCmd}`
            });
          }
          return;
        }

        const source = ligne.sourceReelle || 'CONFORME';
        const isBarre =
          source === 'BARRE_NEUVE' ||
          (source === 'CONFORME' && ligne.typeSupport === 'BARRE_NEUVE');

        const realSupportLg = ligne.longueurSourceReelle || ligne.longueurPrevue;
        const realResteMm = Math.max(0, ligne.resteReelMesureMm ?? ligne.restePrevuMm ?? 0);

        if (isBarre && ligne.articleCode) {
          mouvements.push({
            id: makeId(),
            date: dateTimeStr,
            type: 'SORTIE_BARRE_NEUVE',
            articleCode: ligne.articleCode,
            designation: ligne.articleDesignation,
            ofId: suivi.id,
            numCommande: finalNumCmd,
            nomClient: suivi.nomClient,
            longueurMm: realSupportLg,
            quantite: 1,
            remarque: `Barre neuve débitée (${realSupportLg}mm) — Repère: ${ligne.repere}`
          });
        } else if (source === 'CHUTE_NON_INVENTORIEE') {
          mouvements.push({
            id: makeId(),
            date: dateTimeStr,
            type: 'AJUSTEMENT_INVENTAIRE',
            articleCode: ligne.articleCode,
            designation: ligne.articleDesignation,
            ofId: suivi.id,
            numCommande: finalNumCmd,
            nomClient: suivi.nomClient,
            longueurMm: realSupportLg,
            quantite: 1,
            remarque: `Régularisation chute atelier non inventoriée (${realSupportLg}mm)`
          });
        } else if (ligne.articleCode) {
          mouvements.push({
            id: makeId(),
            date: dateTimeStr,
            type: 'SORTIE_CHUTE',
            articleCode: ligne.articleCode,
            designation: ligne.articleDesignation,
            ofId: suivi.id,
            numCommande: finalNumCmd,
            nomClient: suivi.nomClient,
            longueurMm: realSupportLg,
            quantite: 1,
            remarque: `Chute stock débitée (${realSupportLg}mm) — Repère: ${ligne.repere}`,
            chuteId: ligne.chuteId
          });
        }

        if (ligne.actionReste === 'A_STOCKER' && realResteMm > 0 && ligne.articleCode) {
          mouvements.push({
            id: makeId(),
            date: dateTimeStr,
            type: 'ENTREE_CHUTE',
            articleCode: ligne.articleCode,
            designation: ligne.articleDesignation,
            ofId: suivi.id,
            numCommande: finalNumCmd,
            nomClient: suivi.nomClient,
            longueurMm: realResteMm,
            quantite: 1,
            remarque: `Nouvelle chute rack (${realResteMm}mm) — OF ${suivi.codeOF || finalNumCmd}`
          });
        }
      });

      await StorageService.closeOF(
        {
          ...suivi,
          statut: 'CLOTURE',
          dateRetour: todayStr,
          lignesRetour: lignes,
          remarqueGlobale: remarqueGlobale.trim() || undefined
        },
        mouvements
      );

      // Verrouiller immédiatement
      setIsClotureTerminee(true);
      setShowConfirmModal(false);
      onRefreshData();

      // Fermeture immédiate de la fenêtre de clôture et retour direct au tableau des ordres
      if (onClotureSuccess) {
        onClotureSuccess();
      } else if (onCloseOF) {
        onCloseOF();
      } else if (onNavigateToTab) {
        onNavigateToTab('encours');
      }
    } catch (err: any) {
      alert(`Erreur clôture : ${err?.message || 'Erreur'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Alerte si déjà clôturé */}
      {(isClotureTerminee || suivi.statut === 'CLOTURE') && (
        <div className="p-4 bg-emerald-950/90 border-2 border-emerald-500 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-emerald-200 shadow-xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <p className="font-black text-sm text-white">
                Ordre de Fabrication {suivi.codeOF || suivi.numCommande} Déjà Clôturé
              </p>
              <p className="text-xs text-emerald-300">
                Clôturé le {suivi.dateRetour || 'ce jour'} • Stocks déstockés et mouvements validés.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFermerOF}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-md cursor-pointer transition"
          >
            <PackageCheck className="w-4 h-4" />
            <span>Fermer cet OF</span>
          </button>
        </div>
      )}

      {/* Barre d'outils classique */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleToutConforme}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
            <span>⚡ Tout Valider Conforme</span>
          </button>

          <button
            type="button"
            onClick={handleAjouterBarreNeuve}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>➕ Barre Neuve (6m)</span>
          </button>
        </div>

        {/* Filtres d'onglets */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {(['TOUTES', 'A_STOCKER', 'MODIFIEES', 'ANOMALIES'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFiltreLignes(tab)}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                filtreLignes === tab
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'TOUTES' && `Toutes (${lignes.length})`}
              {tab === 'A_STOCKER' && 'À stocker'}
              {tab === 'MODIFIEES' && 'Modifiées'}
              {tab === 'ANOMALIES' && 'Anomalies'}
            </button>
          ))}
        </div>
      </div>

      {/* Barre de recherche rapide */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Rechercher une ligne par repère, profilé ou cote..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
      </div>

      {/* Table détaillée ligne par ligne */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">Repère &amp; Pièces</th>
                <th className="p-3">Support Réel Débité</th>
                <th className="p-3 text-center">Reste Prévu</th>
                <th className="p-3 text-center bg-slate-900/80 text-amber-300">Reste Réel Mesuré</th>
                <th className="p-3 text-center">Destination</th>
                <th className="p-3">Saisie / Remarque Opérateur</th>
                <th className="p-3 text-center w-12">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {lignesAffichees.map(({ ligne, originalIdx }) => {
                const realReste = ligne.resteReelMesureMm ?? ligne.restePrevuMm;
                const supportLg = ligne.longueurSourceReelle || ligne.longueurPrevue;
                const delta = realReste - ligne.restePrevuMm;
                const isBarre =
                  ligne.sourceReelle === 'BARRE_NEUVE' ||
                  (!ligne.sourceReelle && ligne.typeSupport === 'BARRE_NEUVE');
                const isVerif = Boolean(lignesVerifiees[originalIdx]);

                return (
                  <tr
                    key={ligne.id || originalIdx}
                    className={`hover:bg-slate-800/30 transition ${
                      isVerif ? 'bg-slate-900/20' : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="p-3 text-center font-mono text-slate-500">
                      {originalIdx + 1}
                    </td>

                    {/* Repère & Pièces */}
                    <td className="p-3">
                      <div className="font-mono font-bold text-amber-300 text-xs">
                        {ligne.repere}
                      </div>
                      {ligne.piecesInfoStr && (
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {ligne.piecesInfoStr}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {ligne.articleDesignation}
                      </div>
                    </td>

                    {/* Support Réel */}
                    <td className="p-3">
                      <select
                        value={ligne.sourceReelle || 'CONFORME'}
                        onChange={e => {
                          const val = e.target.value as any;
                          updateLigne(originalIdx, { sourceReelle: val });
                        }}
                        className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-400"
                      >
                        <option value="CONFORME">
                          {isBarre ? '🪵 Barre Neuve' : '📦 Chute Stock'} ({ligne.longueurPrevue}mm)
                        </option>
                        <option value="BARRE_NEUVE">🪵 Remplacée par Barre 6m</option>
                        <option value="AUTRE_CHUTE">📦 Autre Chute Stock</option>
                        <option value="CHUTE_NON_INVENTORIEE">⚡ Chute Hors-Stock</option>
                      </select>
                    </td>

                    {/* Reste prévu */}
                    <td className="p-3 text-center font-mono text-slate-400">
                      {ligne.restePrevuMm} mm
                    </td>

                    {/* Reste réel mesuré */}
                    <td className="p-3 bg-slate-950/40">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const val = Math.max(0, realReste - 10);
                            updateLigne(originalIdx, { resteReelMesureMm: val });
                          }}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold text-xs"
                          title="-10 mm"
                        >
                          -10
                        </button>

                        <input
                          type="number"
                          value={realReste}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            updateLigne(originalIdx, { resteReelMesureMm: val });
                          }}
                          className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-amber-300 text-center focus:outline-none focus:border-amber-400"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            const val = realReste + 10;
                            updateLigne(originalIdx, { resteReelMesureMm: val });
                          }}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold text-xs"
                          title="+10 mm"
                        >
                          +10
                        </button>
                      </div>

                      {delta !== 0 && (
                        <div className={`text-[10px] text-center font-mono mt-1 ${delta > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                          {delta > 0 ? `+${delta} mm` : `${delta} mm`}
                        </div>
                      )}
                    </td>

                    {/* Destination */}
                    <td className="p-3 text-center">
                      <select
                        value={ligne.actionReste || 'DECHET'}
                        onChange={e => {
                          updateLigne(originalIdx, { actionReste: e.target.value as any });
                        }}
                        className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                          ligne.actionReste === 'A_STOCKER'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-slate-950 text-slate-400 border-slate-700'
                        }`}
                      >
                        <option value="A_STOCKER">📦 À Ranger (Stock)</option>
                        <option value="DECHET">🗑️ Déchet (Bac)</option>
                      </select>
                    </td>

                    {/* Remarque */}
                    <td className="p-3">
                      <input
                        type="text"
                        placeholder="Annotation opérateur..."
                        value={ligne.saisieOperateur || ligne.remarque || ''}
                        onChange={e => {
                          updateLigne(originalIdx, { saisieOperateur: e.target.value });
                        }}
                        className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-amber-400"
                      />
                    </td>

                    {/* Check */}
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setLignesVerifiees(prev => ({
                            ...prev,
                            [originalIdx]: !prev[originalIdx]
                          }));
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition cursor-pointer mx-auto ${
                          isVerif
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-600 hover:text-slate-300'
                        }`}
                        title="Marquer cette ligne comme vérifiée"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remarque générale & Validation finale */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Remarque générale de clôture
          </label>
          <input
            type="text"
            placeholder="ex: Contrôle ligne par ligne effectué par l'opérateur"
            value={remarqueGlobale}
            onChange={e => setRemarqueGlobale(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400">
            {Object.keys(lignesVerifiees).length} / {lignes.length} ligne(s) vérifiée(s)
          </div>

          <div className="flex items-center gap-3">
            {/* Bouton Quitter et retourner au tableau sans clôturer */}
            <button
              type="button"
              onClick={() => {
                if (onNavigateToTab) onNavigateToTab('encours');
                else if (onCloseOF) onCloseOF();
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
              title="Retourner au tableau des Ordres en cours sans clôturer"
            >
              <ArrowLeft className="w-4 h-4 text-slate-400" />
              <span>Tableau</span>
            </button>

            {/* Bouton Rétablir l'état initial */}
            {!isClotureTerminee && suivi.statut !== 'CLOTURE' && (
              <button
                type="button"
                onClick={handleResetInitial}
                className="px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 text-amber-400 hover:text-amber-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border border-amber-500/30"
                title="Rétablir les lignes initiales sans quitter l'OF en cours"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rétablir plan initial</span>
              </button>
            )}

            {isClotureTerminee || suivi.statut === 'CLOTURE' ? (
              <div className="flex items-center gap-2.5">
                <div className="px-4 py-2.5 bg-emerald-950/90 border border-emerald-500/80 text-emerald-400 font-bold rounded-xl text-xs flex items-center gap-2 shadow-inner">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>OF Clôturé avec succès</span>
                </div>
                <button
                  type="button"
                  onClick={handleFermerOF}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>Retourner au tableau</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSubmitting || isClotureTerminee}
                onClick={() => setShowConfirmModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-sm shadow-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement en cours...</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-4 h-4" />
                    <span>✅ Valider la Clôture Définitive (Mode Classique)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation de Clôture avec Fermeture Immédiate & Retour au Tableau */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        title={`Clôturer l'Ordre ${suivi.codeOF || suivi.numCommande} ?`}
        message="Voulez-vous valider définitivement la clôture de cet ordre ? La fenêtre de clôture se fermera immédiatement et vous retournerez au tableau pour une autre action."
        confirmLabel="Valider et Retourner au Tableau"
        cancelLabel="Annuler (Continuer sur cet OF)"
        type="save"
        isProcessing={isSubmitting}
        details={[
          `${lignes.filter(l => l.sourceReelle === 'BARRE_NEUVE' || l.typeSupport === 'BARRE_NEUVE').length} barre(s) neuve(s) débitée(s)`,
          `${lignes.filter(l => (l.resteReelMesureMm ?? l.restePrevuMm) > 0 && l.actionReste === 'A_STOCKER').length} chute(s) à ranger`,
          `${Object.keys(lignesVerifiees).length} / ${lignes.length} ligne(s) vérifiée(s)`
        ]}
        onConfirm={handleValiderClotureClassique}
        onClose={() => setShowConfirmModal(false)}
      />
    </div>
  );
};
