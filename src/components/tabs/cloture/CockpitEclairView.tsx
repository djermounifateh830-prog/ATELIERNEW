import React, { useState, useMemo } from 'react';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Minus,
  Trash2,
  Package,
  Layers,
  Sparkles,
  RefreshCw,
  Box,
  Check,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Search,
  Archive,
  ArrowRight
} from 'lucide-react';
import { Article, ChuteItem, SuiviOF } from '../../../types';
import {
  BilanCockpitOF,
  ProfilBilanCockpit,
  AccessoireBilanCockpit,
  ConcordanceOFService
} from '../../../services/concordanceOFService';
import { ChuteRackPickerModal } from './ChuteRackPickerModal';
import { StorageService } from '../../../services/storage';

interface CockpitEclairViewProps {
  suivi: SuiviOF;
  bilan: BilanCockpitOF;
  articles: Article[];
  chutesBarres: Record<string, ChuteItem[]>;
  mapping: Record<string, string>;
  onBilanChange: (newBilan: BilanCockpitOF) => void;
  onRefreshData: () => void;
  onClotureSuccess?: () => void;
}

export const CockpitEclairView: React.FC<CockpitEclairViewProps> = ({
  suivi,
  bilan,
  articles,
  chutesBarres,
  mapping,
  onBilanChange,
  onRefreshData,
  onClotureSuccess
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [remarqueGenerale, setRemarqueGenerale] = useState(suivi.remarqueGlobale || '');

  // Modal sélection chute de rack pour un profilé particulier
  const [pickerProfileIdx, setPickerProfileIdx] = useState<number | null>(null);

  // État de dépliage des détails fins pour les chutes utilisées
  const [expandedChuteGroups, setExpandedChuteGroups] = useState<Record<string, boolean>>({});

  // Mise à jour d'un profilé
  const updateProfil = (profilIdx: number, updates: Partial<ProfilBilanCockpit>) => {
    const updatedProfils = [...bilan.profils];
    updatedProfils[profilIdx] = { ...updatedProfils[profilIdx], ...updates };

    // Calculer s'il y a des écarts par rapport au prévu
    let totalEcarts = 0;
    updatedProfils.forEach(p => {
      if (p.barresNeuvesReelles !== p.barresNeuvesPrevues) totalEcarts++;
      if (p.barresRebut > 0) totalEcarts++;
      p.chutesUtiliseesReelles.forEach(c => {
        if (!c.utilisee || c.source !== 'PREVUE') totalEcarts++;
      });
      p.chutesGenereesReelles.forEach(cg => {
        if (cg.modifieeManuellement) totalEcarts++;
      });
    });

    bilan.accessoires.forEach(a => {
      if (!a.cochee || a.quantiteReelle !== a.quantitePrevue) totalEcarts++;
    });

    onBilanChange({
      ...bilan,
      profils: updatedProfils,
      estConformeAuPlan: totalEcarts === 0,
      nbAjustements: totalEcarts
    });
  };

  // Mise à jour des accessoires
  const updateAccessoire = (accIdx: number, updates: Partial<AccessoireBilanCockpit>) => {
    const updatedAccs = [...bilan.accessoires];
    updatedAccs[accIdx] = { ...updatedAccs[accIdx], ...updates };

    let totalEcarts = 0;
    bilan.profils.forEach(p => {
      if (p.barresNeuvesReelles !== p.barresNeuvesPrevues) totalEcarts++;
      if (p.barresRebut > 0) totalEcarts++;
      p.chutesUtiliseesReelles.forEach(c => {
        if (!c.utilisee || c.source !== 'PREVUE') totalEcarts++;
      });
      p.chutesGenereesReelles.forEach(cg => {
        if (cg.modifieeManuellement) totalEcarts++;
      });
    });
    updatedAccs.forEach(a => {
      if (!a.cochee || a.quantiteReelle !== a.quantitePrevue) totalEcarts++;
    });

    onBilanChange({
      ...bilan,
      accessoires: updatedAccs,
      estConformeAuPlan: totalEcarts === 0,
      nbAjustements: totalEcarts
    });
  };

  // Exécution de la clôture
  const handleValiderCloture = async () => {
    setIsSubmitting(true);
    try {
      const todayStr = new Date().toLocaleDateString('fr-FR');
      const { mouvements, lignesRetourActualisees } = ConcordanceOFService.calculerMouvementsEtLignesCloture(
        bilan,
        suivi,
        todayStr,
        remarqueGenerale.trim() || undefined
      );

      const finalSuivi: SuiviOF = {
        ...suivi,
        statut: 'CLOTURE',
        dateRetour: todayStr,
        remarqueGlobale: remarqueGenerale.trim() || undefined,
        lignesRetour: lignesRetourActualisees
      };

      await StorageService.closeOF(finalSuivi, mouvements);

      setSuccessMessage(`OF ${bilan.codeOF || suivi.numCommande} clôturé avec succès ! Stocks et chutes actualisés.`);
      onRefreshData();
      if (onClotureSuccess) {
        setTimeout(() => onClotureSuccess(), 1200);
      }
    } catch (err: any) {
      alert(`Erreur lors de la clôture de l'OF : ${err?.message || 'Erreur inconnue'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Totaux globaux en pièces (aucune unité métrique)
  const totauxPieces = useMemo(() => {
    let totalBarres = 0;
    let totalBarresRebut = 0;
    let totalChutesDebitees = 0;
    let totalChutesARanger = 0;

    bilan.profils.forEach(p => {
      totalBarres += p.barresNeuvesReelles;
      totalBarresRebut += p.barresRebut;
      totalChutesDebitees += p.chutesUtiliseesReelles.filter(c => c.utilisee).length;
      totalChutesARanger += p.chutesGenereesReelles.reduce((sum, cg) => sum + (cg.quantite ?? 1), 0);
    });

    const totalAccessoires = bilan.accessoires.filter(a => a.cochee).reduce((s, a) => s + a.quantiteReelle, 0);

    return {
      totalBarres,
      totalBarresRebut,
      totalChutesDebitees,
      totalChutesARanger,
      totalAccessoires
    };
  }, [bilan]);

  const currentPickerProfile = pickerProfileIdx !== null ? bilan.profils[pickerProfileIdx] : null;

  return (
    <div className="space-y-6">
      {/* Banner de succès */}
      {successMessage && (
        <div className="p-4 bg-emerald-950/90 border border-emerald-500 rounded-2xl flex items-center justify-between text-emerald-200 shadow-xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-sm">{successMessage}</p>
              <p className="text-xs text-emerald-300/80">
                Toutes les écritures de débit de barres, régularisations de chutes et accessoires ont été enregistrées sans déchet superflu.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-200 px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-900/80 rounded-lg cursor-pointer transition"
          >
            Fermer
          </button>
        </div>
      )}

      {/* En-tête Synthétique & Compteurs de Pièces */}
      <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <span className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-black font-mono text-sm tracking-wide shadow-xs">
            {bilan.codeOF}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-100">
                Commande <span className="text-amber-400 font-mono">{bilan.numCommande}</span>
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs font-semibold text-slate-300">
                Client : <strong className="text-white">{bilan.nomClient}</strong>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {bilan.titreSection} • Émis le {bilan.dateEmission} • Donneur d'ordre : {bilan.donneurOrdre || 'Atelier'}
            </p>
          </div>
        </div>

        {/* Badges synthétiques du bilan en pièces */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-xs font-bold" title="Barres neuves 6m consommées">
            <Box className="w-3.5 h-3.5 text-emerald-400" />
            <span>{totauxPieces.totalBarres} barre(s) 6m</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sky-950/70 border border-sky-800/60 text-sky-300 text-xs font-bold" title="Chutes débitées du rack">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>{totauxPieces.totalChutesDebitees} chute(s) débitée(s)</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-950/70 border border-amber-800/60 text-amber-300 text-xs font-bold" title="Nouvelles chutes réelles à ranger au rack">
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>{totauxPieces.totalChutesARanger} chute(s) à ranger</span>
          </div>

          {totauxPieces.totalAccessoires > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-950/70 border border-purple-800/60 text-purple-300 text-xs font-bold" title="Accessoires magasin">
              <Package className="w-3.5 h-3.5 text-purple-400" />
              <span>{totauxPieces.totalAccessoires} acc.</span>
            </div>
          )}

          {bilan.estConformeAuPlan ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Conforme au plan</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{bilan.nbAjustements} ajustement(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Cartes des Profilés avec vue groupée par quantité */}
      <div className="space-y-6">
        {bilan.profils.map((profil, pIdx) => {
          // 1. Groupement intelligent des chutes utilisées par longueur et source
          const groupedChutesUtilisees = (() => {
            const groups: Record<string, {
              key: string;
              longueur: number;
              source: string;
              items: typeof profil.chutesUtiliseesReelles;
              totalCount: number;
              usedCount: number;
              unusedCount: number;
            }> = {};

            profil.chutesUtiliseesReelles.forEach(c => {
              const key = `${c.source}_${c.longueur}`;
              if (!groups[key]) {
                groups[key] = {
                  key,
                  longueur: c.longueur,
                  source: c.source,
                  items: [],
                  totalCount: 0,
                  usedCount: 0,
                  unusedCount: 0
                };
              }
              groups[key].items.push(c);
              groups[key].totalCount++;
              if (c.utilisee) groups[key].usedCount++;
              else groups[key].unusedCount++;
            });

            return Object.values(groups).sort((a, b) => b.longueur - a.longueur);
          })();

          // 2. Chutes réelles générées à ranger (groupées avec quantité)
          const chutesARanger = profil.chutesGenereesReelles;
          const totalChutesARangerPcs = chutesARanger.reduce((sum, cg) => sum + (cg.quantite ?? 1), 0);
          const totalChutesDebiteesPcs = profil.chutesUtiliseesReelles.filter(c => c.utilisee).length;

          return (
            <div
              key={profil.articleCode || pIdx}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all"
            >
              {/* En-tête profilé épuré */}
              <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs">
                    P{pIdx + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-100 flex items-center gap-2">
                      <span>{profil.articleDesignation}</span>
                      {profil.articleCode && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-normal">
                          {profil.articleCode}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Standard : {profil.longueurStandard} mm • Rack : <span className="text-sky-300 font-semibold">{profil.sheetName}</span> • Seuil de stockage : <span className="text-amber-300 font-semibold">≥ {profil.refusMax} mm</span>
                    </p>
                  </div>
                </div>

                {/* Résumé profilé en pièces */}
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                    Prévu : <strong className="text-emerald-300">{profil.barresNeuvesPrevues} barre(s) 6m</strong> &amp; <strong className="text-sky-300">{profil.chutesUtiliseesPrevues.length} chute(s)</strong>
                  </span>
                </div>
              </div>

              {/* 3 Colonnes : Barres 6m | Chutes Rack Utilisées | Chutes à Ranger */}
              <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 1. Barres neuves 6m */}
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between shadow-inner">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Box className="w-4 h-4 text-emerald-400" />
                        <span>Barres neuves 6m</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Prévu : <strong className="text-slate-200">{profil.barresNeuvesPrevues} pcs</strong>
                      </span>
                    </div>

                    {/* Stepper rapide de barres */}
                    <div className="flex items-center justify-center gap-3 my-3">
                      <button
                        type="button"
                        onClick={() => {
                          const val = Math.max(0, profil.barresNeuvesReelles - 1);
                          updateProfil(pIdx, { barresNeuvesReelles: val });
                        }}
                        className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-base transition cursor-pointer"
                        title="Diminuer d'une barre"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <div className="text-center px-4 py-1.5 bg-slate-900 border border-slate-700 rounded-xl min-w-20 shadow-xs">
                        <span className="text-2xl font-black font-mono text-emerald-400">
                          {profil.barresNeuvesReelles}
                        </span>
                        <span className="text-[10px] block text-slate-400 font-medium">pcs</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          updateProfil(pIdx, { barresNeuvesReelles: profil.barresNeuvesReelles + 1 });
                        }}
                        className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-base transition cursor-pointer"
                        title="Ajouter une barre 6m"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {profil.barresNeuvesReelles !== profil.barresNeuvesPrevues && (
                      <div className="text-center text-[11px] text-amber-300 font-semibold mb-2">
                        {profil.barresNeuvesReelles > profil.barresNeuvesPrevues
                          ? `+${profil.barresNeuvesReelles - profil.barresNeuvesPrevues} barre(s) par rapport au plan`
                          : `${profil.barresNeuvesReelles - profil.barresNeuvesPrevues} barre(s) par rapport au plan`}
                      </div>
                    )}
                  </div>

                  {/* Déclaration Casse / Rebut Atelier */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        updateProfil(pIdx, {
                          barresNeuvesReelles: profil.barresNeuvesReelles + 1,
                          barresRebut: profil.barresRebut + 1
                        });
                      }}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      title="Déclarer 1 barre de remplacement consommée suite à une erreur de coupe ou pièce abîmée"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+1 Barre Rebut (Casse atelier)</span>
                    </button>
                    {profil.barresRebut > 0 && (
                      <p className="text-[10px] text-rose-400 text-center mt-1 font-semibold">
                        ⚠️ {profil.barresRebut} barre(s) tracée(s) comme rebut atelier
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Chutes du rack utilisées (Visualisation groupée par quantité) */}
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between shadow-inner">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-sky-400" />
                        <span>Chutes du rack débitées</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Total : <strong className="text-sky-300">{totalChutesDebiteesPcs} pcs</strong>
                      </span>
                    </div>

                    {groupedChutesUtilisees.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        Aucune chute du rack utilisée pour ce profilé
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        {groupedChutesUtilisees.map(grp => {
                          const isExpanded = !!expandedChuteGroups[`${pIdx}_${grp.key}`];
                          const allUsed = grp.unusedCount === 0;

                          return (
                            <div
                              key={grp.key}
                              className={`p-3 rounded-xl border transition-all ${
                                allUsed
                                  ? 'bg-slate-900 border-slate-700/80'
                                  : 'bg-amber-950/20 border-amber-700/60'
                              }`}
                            >
                              {/* Ligne principale du groupe */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono font-black text-xs text-sky-300">
                                    {grp.longueur} mm
                                  </div>
                                  <span className="text-xs font-bold text-slate-300">
                                    × {grp.totalCount} pcs
                                  </span>
                                  {grp.source === 'HORS_STOCK' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50">
                                      Hors-stock
                                    </span>
                                  )}
                                </div>

                                {/* Statut d'utilisation et stepper */}
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                                    <button
                                      type="button"
                                      disabled={grp.usedCount <= 0}
                                      onClick={() => {
                                        // Décocher une chute de ce groupe
                                        const updated = [...profil.chutesUtiliseesReelles];
                                        const targetIdx = updated.findIndex(
                                          c => c.longueur === grp.longueur && c.source === grp.source && c.utilisee
                                        );
                                        if (targetIdx !== -1) {
                                          updated[targetIdx] = {
                                            ...updated[targetIdx],
                                            utilisee: false,
                                            motifNonUtilisation: 'REMPLACEE_GARDER_AU_STOCK'
                                          };
                                          updateProfil(pIdx, { chutesUtiliseesReelles: updated });
                                        }
                                      }}
                                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer transition"
                                      title="Décocher une chute (non utilisée)"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>

                                    <span className={`text-xs font-mono font-bold px-1.5 ${allUsed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                      {grp.usedCount}/{grp.totalCount}
                                    </span>

                                    <button
                                      type="button"
                                      disabled={grp.usedCount >= grp.totalCount}
                                      onClick={() => {
                                        // Recocher une chute de ce groupe
                                        const updated = [...profil.chutesUtiliseesReelles];
                                        const targetIdx = updated.findIndex(
                                          c => c.longueur === grp.longueur && c.source === grp.source && !c.utilisee
                                        );
                                        if (targetIdx !== -1) {
                                          updated[targetIdx] = {
                                            ...updated[targetIdx],
                                            utilisee: true
                                          };
                                          updateProfil(pIdx, { chutesUtiliseesReelles: updated });
                                        }
                                      }}
                                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer transition"
                                      title="Recocher une chute (utilisée)"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {grp.totalCount > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedChuteGroups(prev => ({
                                          ...prev,
                                          [`${pIdx}_${grp.key}`]: !prev[`${pIdx}_${grp.key}`]
                                        }));
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-200 transition"
                                      title="Voir les chutes individuelles"
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* ALERTE & CHOIX INTELLIGENT SI CHUTE NON UTILISÉE */}
                              {grp.unusedCount > 0 && (
                                <div className="mt-2.5 pt-2.5 border-t border-amber-800/40 space-y-2">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-amber-300 font-semibold flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                      <span>{grp.unusedCount} chute(s) non utilisée(s) :</span>
                                    </span>
                                  </div>

                                  {/* Pour chaque chute non utilisée de ce groupe : choix clair Introuvable vs Remplacée */}
                                  {grp.items.filter(c => !c.utilisee).map((unusedChute) => {
                                    const isIntrouvable = unusedChute.motifNonUtilisation === 'INTROUVABLE_SUPPRIMER';

                                    return (
                                      <div
                                        key={unusedChute.id}
                                        className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2"
                                      >
                                        <div className="text-[11px] text-slate-300">
                                          {unusedChute.repere || `#${unusedChute.chuteId || 'Chute'}`} :
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                          {/* Bouton Option 1 : Remplacée / Laissée au rack */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = profil.chutesUtiliseesReelles.map(c => {
                                                if (c.id === unusedChute.id) {
                                                  return { ...c, motifNonUtilisation: 'REMPLACEE_GARDER_AU_STOCK' as const };
                                                }
                                                return c;
                                              });
                                              updateProfil(pIdx, { chutesUtiliseesReelles: updated });
                                            }}
                                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                              !isIntrouvable
                                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 shadow-xs'
                                                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                                            }`}
                                            title="La chute est restée physiquement au rack et reste disponible pour d'autres commandes"
                                          >
                                            <Archive className="w-3 h-3" />
                                            <span>Remplacée (Garder au rack)</span>
                                          </button>

                                          {/* Bouton Option 2 : Introuvable / Perdue (supprimer du stock) */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = profil.chutesUtiliseesReelles.map(c => {
                                                if (c.id === unusedChute.id) {
                                                  return { ...c, motifNonUtilisation: 'INTROUVABLE_SUPPRIMER' as const };
                                                }
                                                return c;
                                              });
                                              updateProfil(pIdx, { chutesUtiliseesReelles: updated });
                                            }}
                                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                              isIntrouvable
                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-xs'
                                                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                                            }`}
                                            title="La chute est introuvable au rack : elle sera supprimée définitivement du stock"
                                          >
                                            <Trash2 className="w-3 h-3 text-rose-400" />
                                            <span>Introuvable (Supprimer stock)</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Raccourci de compensation par 1 barre 6m */}
                                  <div className="flex items-center justify-end gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateProfil(pIdx, {
                                          barresNeuvesReelles: profil.barresNeuvesReelles + 1
                                        });
                                      }}
                                      className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold hover:bg-emerald-900 transition flex items-center gap-1 cursor-pointer"
                                      title="Ajouter 1 barre neuve de remplacement pour compenser cette chute"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Compenser avec +1 Barre 6m</span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Détail individuel si l'utilisateur déplie */}
                              {isExpanded && grp.totalCount > 1 && (
                                <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1.5">
                                  {grp.items.map((item, itemIdx) => (
                                    <div
                                      key={item.id || itemIdx}
                                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-950/60"
                                    >
                                      <span className="text-slate-400 font-mono text-[11px]">
                                        {item.repere || `ID ${item.chuteId || itemIdx + 1}`}
                                      </span>
                                      <span className={item.utilisee ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                                        {item.utilisee ? '✓ Utilisée' : 'Non utilisée'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bouton ajouter une autre chute du rack */}
                  <div className="pt-2 border-t border-slate-800/80 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerProfileIdx(pIdx)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-sky-950/50 hover:bg-sky-950/80 border border-sky-800/60 text-sky-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      title="Choisir une autre chute dans le rack physique"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Autre chute rack</span>
                    </button>
                  </div>
                </div>

                {/* 3. Chutes à ranger au rack (Sans notion de repère, groupées en pièces pcs) */}
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between shadow-inner">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Archive className="w-4 h-4 text-amber-400" />
                        <span>Chutes à ranger au rack</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Total : <strong className="text-amber-300">{totalChutesARangerPcs} pcs</strong>
                      </span>
                    </div>

                    {chutesARanger.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        Aucune nouvelle chute à ranger pour ce profilé
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        {chutesARanger.map((cg, cgIdx) => {
                          const qte = cg.quantite ?? 1;

                          return (
                            <div
                              key={cg.id || cgIdx}
                              className="p-2.5 rounded-xl border border-amber-800/40 bg-slate-900/90 flex items-center justify-between gap-3 shadow-xs"
                            >
                              {/* Saisie directe de la longueur en mm */}
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="text-[11px] text-slate-400 font-medium">Lg :</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={cg.longueur}
                                  onChange={e => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    const updated = [...chutesARanger];
                                    updated[cgIdx] = {
                                      ...cg,
                                      longueur: val,
                                      modifieeManuellement: true
                                    };
                                    updateProfil(pIdx, { chutesGenereesReelles: updated });
                                  }}
                                  className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg font-mono font-black text-xs text-amber-300 text-center focus:outline-none focus:border-amber-400"
                                />
                                <span className="text-xs text-slate-400 font-mono">mm</span>
                              </div>

                              {/* Stepper de quantité en pcs */}
                              <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (qte <= 1) {
                                      // Si qte arrive à 0, supprimer la ligne
                                      const updated = chutesARanger.filter((_, idx) => idx !== cgIdx);
                                      updateProfil(pIdx, { chutesGenereesReelles: updated });
                                    } else {
                                      const updated = [...chutesARanger];
                                      updated[cgIdx] = {
                                        ...cg,
                                        quantite: qte - 1,
                                        modifieeManuellement: true
                                      };
                                      updateProfil(pIdx, { chutesGenereesReelles: updated });
                                    }
                                  }}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer transition"
                                  title="Diminuer la quantité"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>

                                <span className="text-xs font-mono font-black text-slate-100 px-2">
                                  {qte} <span className="text-[10px] text-slate-400 font-normal">pcs</span>
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...chutesARanger];
                                    updated[cgIdx] = {
                                      ...cg,
                                      quantite: qte + 1,
                                      modifieeManuellement: true
                                    };
                                    updateProfil(pIdx, { chutesGenereesReelles: updated });
                                  }}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer transition"
                                  title="Augmenter la quantité"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Suppression de la ligne */}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = chutesARanger.filter((_, idx) => idx !== cgIdx);
                                  updateProfil(pIdx, { chutesGenereesReelles: updated });
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                                title="Supprimer cette chute à ranger"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bouton ajouter une nouvelle chute réelle mesurée */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [
                          ...chutesARanger,
                          {
                            id: `chute-ajoutee-${Date.now()}`,
                            longueur: 1200,
                            quantite: 1,
                            statut: 'A_STOCKER' as const,
                            modifieeManuellement: true
                          }
                        ];
                        updateProfil(pIdx, { chutesGenereesReelles: updated });
                      }}
                      className="w-full py-1.5 px-2 rounded-lg bg-amber-950/50 hover:bg-amber-950/80 border border-amber-800/60 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      title="Ajouter une nouvelle chute mesurée au mètre à stocker au rack"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Ajouter chute à ranger</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessoires Magasin (Joues, bouchons, etc.) */}
      {bilan.accessoires.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-400" />
              <span>Accessoires &amp; Quincaillerie Magasin Décomptés</span>
            </h4>
            <span className="text-xs text-slate-400">
              Décomptés automatiquement du stock magasin en pièces
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {bilan.accessoires.map((acc, aIdx) => (
              <div
                key={acc.codeArt || aIdx}
                className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between gap-2"
              >
                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={acc.cochee}
                    onChange={e => updateAccessoire(aIdx, { cochee: e.target.checked })}
                    className="w-4 h-4 rounded text-purple-500 bg-slate-800 border-slate-600 focus:ring-0 cursor-pointer"
                  />
                  <div className="truncate">
                    <span className="text-xs font-bold text-slate-100 block truncate">
                      {acc.designation}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Code : {acc.codeArt}
                    </span>
                  </div>
                </label>

                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={acc.quantiteReelle}
                    onChange={e => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      updateAccessoire(aIdx, { quantiteReelle: val });
                    }}
                    className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs font-mono font-bold text-purple-300 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">{acc.unite}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remarque libre & Validation Clôture */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Remarque globale de clôture (optionnel)
          </label>
          <input
            type="text"
            placeholder="ex: Fabrication terminée sans incident"
            value={remarqueGenerale}
            onChange={e => setRemarqueGenerale(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Barre d'action finale */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>
              Fiabilité 100% : Débit exact des barres 6m, régularisation des chutes et nouvelles chutes au rack.
            </span>
          </div>

          <div className="flex items-center gap-3">
            {bilan.estConformeAuPlan ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleValiderCloture}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement en cours...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>⚡ Tout est conforme au plan (Clôturer en 1 clic)</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleValiderCloture}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-amber-950/50 flex items-center gap-2 transition transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement en cours...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>✅ Valider la clôture ({bilan.nbAjustements} ajustement(s) pris en compte)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal choix autre chute de rack */}
      {pickerProfileIdx !== null && currentPickerProfile && (
        <ChuteRackPickerModal
          isOpen={true}
          onClose={() => setPickerProfileIdx(null)}
          articleDesignation={currentPickerProfile.articleDesignation}
          articleCode={currentPickerProfile.articleCode}
          sheetName={currentPickerProfile.sheetName}
          chutesBarres={chutesBarres}
          alreadyUsedChuteIds={
            new Set(
              currentPickerProfile.chutesUtiliseesReelles
                .map(c => c.chuteId)
                .filter(Boolean) as string[]
            )
          }
          onSelectRackChute={chute => {
            const updated = [
              ...currentPickerProfile.chutesUtiliseesReelles,
              {
                id: `rack-${chute.id || Date.now()}`,
                chuteId: chute.id,
                longueur: chute.longueur,
                utilisee: true,
                source: 'STOCK_INVENTORIE' as const,
                repere: `Chute rack (${chute.longueur}mm)`
              }
            ];
            updateProfil(pickerProfileIdx, { chutesUtiliseesReelles: updated });
          }}
          onSelectHorsStockChute={(longueurMm, remarque) => {
            const updated = [
              ...currentPickerProfile.chutesUtiliseesReelles,
              {
                id: `hs-${Date.now()}`,
                longueur: longueurMm,
                utilisee: true,
                source: 'HORS_STOCK' as const,
                repere: `Chute hors-stock (${longueurMm}mm)`,
                remarque
              }
            ];
            updateProfil(pickerProfileIdx, { chutesUtiliseesReelles: updated });
          }}
        />
      )}
    </div>
  );
};
