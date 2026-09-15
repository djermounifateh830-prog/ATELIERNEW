import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  PackageCheck,
  ShieldCheck,
  Zap,
  Info,
  SlidersHorizontal,
  History,
  Scale
} from 'lucide-react';
import { Article, ChuteBarre, ChuteItem, DossierCommandeGlobal, SuiviOF, MouvementStock } from '../../types';
import { ConcordanceOFService, BilanProfileOF, ChuteUtiliseeDeclaration } from '../../services/concordanceOFService';
import { SimulationClotureTester, ResultatSimulation } from '../../services/simulationClotureTester';
import { StorageService } from '../../services/storage';

interface ClotureCockpitTabProps {
  suivisOF: SuiviOF[];
  dossiers: DossierCommandeGlobal[];
  articles: Article[];
  chutesBarres: Record<string, ChuteItem[]>;
  mapping: Record<string, string>;
  onRefreshData: () => void;
  onNavigateToTab?: (tabId: string) => void;
}

export const ClotureCockpitTab: React.FC<ClotureCockpitTabProps> = ({
  suivisOF,
  dossiers,
  articles,
  chutesBarres,
  mapping,
  onRefreshData,
  onNavigateToTab
}) => {
  // Sous-onglet : Cockpit Exploitation Réel vs Simulateur de Fiabilité 100%
  const [subTab, setSubTab] = useState<'EXPLOITATION' | 'SIMULATEUR'>('EXPLOITATION');

  // OF sélectionné pour clôture
  const ofsActifs = useMemo(() => {
    return suivisOF.filter(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE');
  }, [suivisOF]);

  const [selectedOFId, setSelectedOFId] = useState<string>('');

  useEffect(() => {
    if (!selectedOFId && ofsActifs.length > 0) {
      setSelectedOFId(ofsActifs[0].id);
    }
  }, [ofsActifs, selectedOFId]);

  const currentOF = useMemo(() => {
    return suivisOF.find(o => o.id === selectedOFId);
  }, [suivisOF, selectedOFId]);

  // Dossier de commande associé en temps réel
  const currentDossier = useMemo(() => {
    if (!currentOF) return undefined;
    return dossiers.find(d => {
      if (d.refCommande && currentOF.numCommande.includes(d.refCommande)) return true;
      if (d.numCommandePrecadre && currentOF.numCommande.includes(d.numCommandePrecadre)) return true;
      if (d.numCommandeTablier && currentOF.numCommande.includes(d.numCommandeTablier)) return true;
      if (d.numCommandeCaisson && currentOF.numCommande.includes(d.numCommandeCaisson)) return true;
      if (d.numCommandeMoustiquaire && currentOF.numCommande.includes(d.numCommandeMoustiquaire)) return true;
      return false;
    });
  }, [currentOF, dossiers]);

  // Stock de chutes plat
  const chutesPlates = useMemo(() => {
    const list: ChuteBarre[] = [];
    Object.entries(chutesBarres).forEach(([sheet, arr]) => {
      arr.forEach(c => list.push({ ...c, sheet_name: sheet }));
    });
    return list;
  }, [chutesBarres]);

  // Bilan matière calculé et modifiable
  const [bilan, setBilan] = useState<BilanProfileOF | null>(null);

  // Recharger le bilan quand l'OF change
  useEffect(() => {
    if (currentOF) {
      const b = ConcordanceOFService.preparerBilanOF(
        currentOF,
        currentDossier,
        articles,
        chutesPlates,
        mapping
      );
      setBilan(b);
    } else {
      setBilan(null);
    }
  }, [currentOF, currentDossier, articles, chutesPlates, mapping]);

  // Modal d'ajout de chute du rack ou hors-stock
  const [showAddChuteModal, setShowAddChuteModal] = useState(false);
  const [chuteSearchQuery, setChuteSearchQuery] = useState('');
  const [nouvelleChuteHorsStockLg, setNouvelleChuteHorsStockLg] = useState('');
  const [nouvelleChuteHorsStockRemarque, setNouvelleChuteHorsStockRemarque] = useState('');

  // Saisie manuelle d'une nouvelle chute générée
  const [nouvelleChuteGenereeLg, setNouvelleChuteGenereeLg] = useState('');

  // Simulations automatiques
  const [simulations, setSimulations] = useState<ResultatSimulation[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const lancerSimulations = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const res = SimulationClotureTester.executerToutesLesSimulations();
      setSimulations(res);
      setIsSimulating(false);
    }, 250);
  };

  useEffect(() => {
    if (subTab === 'SIMULATEUR' && simulations.length === 0) {
      lancerSimulations();
    }
  }, [subTab, simulations.length]);

  // Actions de modification du Bilan en direct
  const ajusterBarresNeuves = (delta: number) => {
    if (!bilan) return;
    const nouveau = Math.max(0, bilan.barresNeuvesReelles + delta);
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      barresNeuvesReelles: nouveau
    }));
  };

  const toggleChuteUtilisee = (id: string) => {
    if (!bilan) return;
    const updated = bilan.chutesUtiliseesReelles.map(c => {
      if (c.id === id) return { ...c, utilisee: !c.utilisee };
      return c;
    });
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesUtiliseesReelles: updated
    }));
  };

  const supprimerChuteUtilisee = (id: string) => {
    if (!bilan) return;
    const updated = bilan.chutesUtiliseesReelles.filter(c => c.id !== id);
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesUtiliseesReelles: updated
    }));
  };

  const basculerToutSurBarresNeuves = () => {
    if (!bilan) return;
    // Désactive toutes les chutes prévues et ajoute le nombre de barres 6m nécessaires
    const chutesDesactivees = bilan.chutesUtiliseesReelles.map(c => ({ ...c, utilisee: false }));
    const longueurManquante = bilan.longueurTotaleRequiseMm + bilan.traitScieEstimeMm;
    const barresNecessaires = Math.ceil(longueurManquante / (bilan.longueurBarreStandard || 6000));

    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesUtiliseesReelles: chutesDesactivees,
      barresNeuvesReelles: Math.max(bilan.barresNeuvesReelles, barresNecessaires)
    }));
  };

  const ajouterChuteDuRack = (chute: ChuteBarre) => {
    if (!bilan) return;
    const nouvelle: ChuteUtiliseeDeclaration = {
      id: `rack-${chute.id}-${Date.now()}`,
      source: 'STOCK_INVENTORIE',
      chuteId: chute.id,
      longueur: chute.longueur,
      quantite: 1,
      designation: `Chute Rack #${chute.id} (${chute.longueur} mm)`,
      utilisee: true
    };
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesUtiliseesReelles: [...bilan.chutesUtiliseesReelles, nouvelle]
    }));
    setShowAddChuteModal(false);
  };

  const ajouterChuteHorsStock = () => {
    if (!bilan) return;
    const lg = parseInt(nouvelleChuteHorsStockLg, 10);
    if (isNaN(lg) || lg <= 0) {
      alert('Veuillez saisir une longueur valide en millimètres.');
      return;
    }
    const nouvelle: ChuteUtiliseeDeclaration = {
      id: `hors-stock-${Date.now()}`,
      source: 'HORS_STOCK_NON_INVENTORIE',
      longueur: lg,
      quantite: 1,
      designation: `Chute trouvée en atelier (${lg} mm - Non inventoriée)`,
      utilisee: true,
      remarque: nouvelleChuteHorsStockRemarque || 'Chute physique atelier sans fiche'
    };
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesUtiliseesReelles: [...bilan.chutesUtiliseesReelles, nouvelle]
    }));
    setNouvelleChuteHorsStockLg('');
    setNouvelleChuteHorsStockRemarque('');
    setShowAddChuteModal(false);
  };

  const ajouterChuteGenereeManuelle = () => {
    if (!bilan) return;
    const lg = parseInt(nouvelleChuteGenereeLg, 10);
    if (isNaN(lg) || lg <= 0) {
      alert('Veuillez saisir une cote valide en mm.');
      return;
    }
    const statut = lg >= bilan.refusMax ? 'A_STOCKER' : 'DECHET_INTERVALLE_REFUS';
    const nouvelle = {
      id: `gen-man-${Date.now()}`,
      longueur: lg,
      statut: statut as 'A_STOCKER' | 'DECHET_INTERVALLE_REFUS',
      remarque: 'Chute mesurée manuellement au mètre ruban'
    };
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesGenereesReelles: [...bilan.chutesGenereesReelles, nouvelle]
    }));
    setNouvelleChuteGenereeLg('');
  };

  const supprimerChuteGeneree = (id: string) => {
    if (!bilan) return;
    const updated = bilan.chutesGenereesReelles.filter(c => c.id !== id);
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesGenereesReelles: updated
    }));
  };

  const toggleStatutChuteGeneree = (id: string) => {
    if (!bilan) return;
    const updated = bilan.chutesGenereesReelles.map(c => {
      if (c.id === id) {
        const next = c.statut === 'A_STOCKER' ? 'DECHET_PUR' : 'A_STOCKER';
        return { ...c, statut: next as any };
      }
      return c;
    });
    setBilan(ConcordanceOFService.recalculerCouverture({
      ...bilan,
      chutesGenereesReelles: updated
    }));
  };

  // Clôture réelle avec mise à jour exacte des stocks
  const [isCloturing, setIsCloturing] = useState(false);

  const handleValiderClotureDefinitive = async () => {
    if (!currentOF || !bilan) return;

    if (!bilan.couvertureEstValide) {
      alert(`Impossible de clôturer l'OF : ${bilan.messageAlerte || 'La matière déclarée ne couvre pas la commande.'}`);
      return;
    }

    const confirmMsg = `Confirmez-vous la clôture définitive de l'ordre ${currentOF.codeOF || currentOF.numCommande} ?\n\n` +
      `• Barres neuves débitées : ${bilan.barresNeuvesReelles} barre(s) 6m de ${bilan.articleDesignation}\n` +
      `• Chutes sorties du stock : ${bilan.chutesUtiliseesReelles.filter(c => c.utilisee && c.source !== 'HORS_STOCK_NON_INVENTORIE').length}\n` +
      `• Nouvelles chutes ajoutées au rack : ${bilan.chutesGenereesReelles.filter(c => c.statut === 'A_STOCKER').length}\n\n` +
      `Les stocks réels d'articles et de chutes seront exactement mis à jour.`;

    if (!window.confirm(confirmMsg)) return;

    setIsCloturing(true);

    try {
      const dateTimeStr = new Date().toLocaleString('fr-FR');
      const mouvements: MouvementStock[] = [];

      // 1. Sortie des barres neuves
      if (bilan.barresNeuvesReelles > 0 && bilan.articleCode) {
        mouvements.push({
          id: `mvt-barre-${Date.now()}`,
          date: dateTimeStr,
          type: 'SORTIE_BARRE_NEUVE',
          articleCode: bilan.articleCode,
          designation: bilan.articleDesignation,
          ofId: currentOF.id,
          numCommande: currentOF.numCommande,
          nomClient: currentOF.nomClient,
          longueurMm: bilan.longueurBarreStandard || 6000,
          quantite: bilan.barresNeuvesReelles,
          remarque: `Clôture Cockpit : ${bilan.barresNeuvesReelles} barre(s) 6m consommées pour ${currentOF.numCommande}`
        });
      }

      // 2. Sortie des chutes du rack utilisées
      bilan.chutesUtiliseesReelles.forEach(c => {
        if (!c.utilisee) return;
        if (c.source === 'HORS_STOCK_NON_INVENTORIE') {
          mouvements.push({
            id: `mvt-adj-${Date.now()}-${c.id}`,
            date: dateTimeStr,
            type: 'AJUSTEMENT_INVENTAIRE',
            articleCode: bilan.articleCode,
            designation: bilan.articleDesignation,
            ofId: currentOF.id,
            numCommande: currentOF.numCommande,
            nomClient: currentOF.nomClient,
            longueurMm: c.longueur,
            quantite: c.quantite,
            remarque: `Chute atelier non inventoriée (${c.longueur} mm) utilisée pour ${currentOF.numCommande}`
          });
        } else {
          mouvements.push({
            id: `mvt-chute-${Date.now()}-${c.id}`,
            date: dateTimeStr,
            type: 'SORTIE_CHUTE',
            articleCode: bilan.articleCode,
            designation: bilan.articleDesignation,
            ofId: currentOF.id,
            numCommande: currentOF.numCommande,
            nomClient: currentOF.nomClient,
            longueurMm: c.longueur,
            quantite: c.quantite,
            chuteId: c.chuteId,
            remarque: `Chute stock consommée (${c.longueur} mm) pour OF ${currentOF.numCommande}`
          });
        }
      });

      // 3. Entrée des nouvelles chutes au rack (>= 500 mm)
      bilan.chutesGenereesReelles.forEach(c => {
        if (c.statut === 'A_STOCKER' && c.longueur > 0) {
          mouvements.push({
            id: `mvt-in-${Date.now()}-${c.id}`,
            date: dateTimeStr,
            type: 'ENTREE_CHUTE',
            articleCode: bilan.articleCode,
            designation: bilan.articleDesignation,
            ofId: currentOF.id,
            numCommande: currentOF.numCommande,
            nomClient: currentOF.nomClient,
            longueurMm: c.longueur,
            quantite: 1,
            remarque: `Nouvelle chute rack (${c.longueur} mm) générée par OF ${currentOF.numCommande}`
          });
        }
      });

      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

      await StorageService.closeOF({
        ...currentOF,
        statut: 'CLOTURE',
        dateRetour: dateStr,
        remarqueGlobale: `Clôture validée via le Cockpit de Concordance (${bilan.barresNeuvesReelles} barres 6m, couverture 100% vérifiée)`
      }, mouvements);

      alert(`✅ Ordre ${currentOF.codeOF || currentOF.numCommande} clôturé avec succès !\nVos stocks de barres neuves et de chutes sont exactement à jour.`);
      onRefreshData();
    } catch (e: any) {
      alert(`Erreur lors de la clôture : ${e.message}`);
    } finally {
      setIsCloturing(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* ── Entête & Navigation entre Exploitation et Simulateur de Fiabilité ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-100 tracking-tight">
                Cockpit Clôture OF &amp; Bilan Matière 100% Fiable
              </h2>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Protection Stocks &amp; Zéro Dérive
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Concordance en temps réel avec la commande modifiée, correction rapide des aléas atelier et gestion fine des chutes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setSubTab('EXPLOITATION')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              subTab === 'EXPLOITATION'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Exploitation Réelle Atelier
            {ofsActifs.length > 0 && (
              <span className="bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded-full text-[10px]">
                {ofsActifs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubTab('SIMULATEUR')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              subTab === 'SIMULATEUR'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Banc de Test &amp; 8 Simulations (Fiabilité 100%)
          </button>
        </div>
      </div>

      {/* ── VUE 1 : EXPLOITATION RÉELLE ATELIER ── */}
      {subTab === 'EXPLOITATION' && (
        <div className="space-y-4">
          {/* Sélection de l'OF en cours */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sélectionner l'OF à clôturer :
              </label>
              <select
                value={selectedOFId}
                onChange={e => setSelectedOFId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-amber-400 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {ofsActifs.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.codeOF || `OF-${o.numeroEmission || '?'}`} • {o.numCommande} — {o.nomClient} ({o.titreSection})
                  </option>
                ))}
                {ofsActifs.length === 0 && (
                  <option value="">Aucun Ordre de Fabrication en cours d'attente</option>
                )}
              </select>
            </div>

            {currentOF && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">Date émission : <b className="text-slate-200">{currentOF.dateEmission}</b></span>
                <span className="text-slate-400">Famille : <b className="text-slate-200">{currentOF.famille}</b></span>
                {currentOF.estPrioritaire && (
                  <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-black">
                    ⚡ PRIORITAIRE
                  </span>
                )}
              </div>
            )}
          </div>

          {currentOF && bilan ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Colonne gauche : Le Bilan & Corrections Terrain (8 cols) */}
              <div className="lg:col-span-8 space-y-4">

                {/* Alerte si la commande a été modifiée après émission */}
                {bilan.commandeModifiee && (
                  <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex items-start gap-3 text-amber-200 shadow-lg animate-pulse">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-300">
                        Commande modifiée après l'émission du bon d'atelier !
                      </h4>
                      <p className="text-xs text-amber-200/90 mt-1">
                        Les cotes ou quantités réelles du dossier diffèrent du plan initial (Écart net de{' '}
                        <b>{Math.round(bilan.deltaLongueurVsEmissionMm)} mm</b>).
                        Le système recalcule automatiquement le contrôle de couverture sur les{' '}
                        <b>{bilan.nbPiecesTotal} pièces réelles actuelles ({bilan.longueurTotaleRequiseMm} mm)</b>.
                      </p>
                    </div>
                  </div>
                )}

                {/* PANNEAU 1 : Barres Neuves 6m Réellement Consommées */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-500/30">
                        1
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">
                        Barres Neuves 6 m Consommées ({bilan.articleDesignation})
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400">
                      Prévu initialement : <b className="text-slate-300">{bilan.barresNeuvesPrevue} barre(s)</b>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <div>
                      <div className="text-xs text-slate-400">Déclaration réelle atelier :</div>
                      <div className="text-lg font-black text-slate-100 mt-0.5">
                        {bilan.barresNeuvesReelles} barre(s) 6m débitée(s)
                        <span className="text-xs font-normal text-slate-400 ml-2">
                          (= {bilan.barresNeuvesReelles * (bilan.longueurBarreStandard || 6000)} mm engagés)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => ajusterBarresNeuves(-1)}
                        className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-lg flex items-center justify-center transition-colors"
                        title="Réduire d'une barre neuve"
                      >
                        -
                      </button>
                      <span className="w-12 text-center text-lg font-black text-amber-400 font-mono">
                        {bilan.barresNeuvesReelles}
                      </span>
                      <button
                        onClick={() => ajusterBarresNeuves(1)}
                        className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-lg flex items-center justify-center transition-colors"
                        title="Ajouter une barre neuve"
                      >
                        +
                      </button>

                      <button
                        onClick={() => ajusterBarresNeuves(1)}
                        className="ml-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/30 transition-colors"
                      >
                        +1 Barre (Rebut / Casse)
                      </button>
                    </div>
                  </div>
                </div>

                {/* PANNEAU 2 : Chutes Utilisées dans l'Atelier (Sorties Stock) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-600/30 text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-500/30">
                        2
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">
                        Chutes Réellement Utilisées (Sorties Rack &amp; Atelier)
                      </h3>
                    </div>

                    <button
                      onClick={basculerToutSurBarresNeuves}
                      className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                      title="Annule toutes les chutes et bascule automatiquement le besoin sur des barres neuves"
                    >
                      ⚡ Tout basculer sur Barres Neuves
                    </button>
                  </div>

                  <div className="space-y-2">
                    {bilan.chutesUtiliseesReelles.map(chute => (
                      <div
                        key={chute.id}
                        className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs transition-colors ${
                          chute.utilisee
                            ? 'bg-slate-950 border-slate-700 text-slate-200'
                            : 'bg-slate-950/40 border-slate-800/60 text-slate-500 line-through'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={chute.utilisee}
                            onChange={() => toggleChuteUtilisee(chute.id)}
                            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-900 cursor-pointer"
                          />
                          <div>
                            <div className="font-bold flex items-center gap-2">
                              <span>{chute.designation}</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-amber-400">
                                {chute.longueur} mm
                              </span>
                              {chute.source === 'HORS_STOCK_NON_INVENTORIE' && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-900/40 text-purple-300 text-[10px] border border-purple-500/30">
                                  Hors-Stock (Atelier)
                                </span>
                              )}
                              {chute.source === 'STOCK_INVENTORIE' && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-900/40 text-blue-300 text-[10px] border border-blue-500/30">
                                  Du Rack Stock
                                </span>
                              )}
                            </div>
                            {chute.remarque && (
                              <div className="text-[11px] text-slate-400 mt-0.5">{chute.remarque}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => supprimerChuteUtilisee(chute.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors"
                            title="Retirer cette chute de la déclaration"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {bilan.chutesUtiliseesReelles.length === 0 && (
                      <div className="text-xs text-slate-500 italic p-3 bg-slate-950/50 rounded-lg text-center">
                        Aucune chute déclarée pour cette commande (100% débité sur barres neuves).
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setShowAddChuteModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      + Ajouter une Chute du Stock / Hors-Stock
                    </button>
                  </div>
                </div>

                {/* PANNEAU 3 : Nouvelles Chutes Utiles à Ranger au Rack (>= 500 mm) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/30">
                        3
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">
                        Chutes Utiles Mesurées à Ranger au Rack (Entrées de Stock ≥ 500 mm)
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Intervalle de refus : &lt; {bilan.refusMax} mm (Mis au déchet)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {bilan.chutesGenereesReelles.map(c => (
                      <div
                        key={c.id}
                        className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                          c.statut === 'A_STOCKER'
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-950 border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={c.statut === 'A_STOCKER'}
                            onChange={() => toggleStatutChuteGeneree(c.id)}
                            className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 focus:ring-offset-slate-900 cursor-pointer"
                          />
                          <div>
                            <div className="font-bold flex items-center gap-2">
                              <span>Chute mesurée :</span>
                              <span className="font-mono text-sm text-emerald-300 font-black">
                                {c.longueur} mm
                              </span>
                              {c.statut === 'A_STOCKER' ? (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/30 font-bold">
                                  📦 À RANGER AU RACK
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px]">
                                  🗑️ Déchet / Intervalle de refus (&lt; {bilan.refusMax}mm)
                                </span>
                              )}
                            </div>
                            {c.remarque && <div className="text-[11px] text-slate-400 mt-0.5">{c.remarque}</div>}
                          </div>
                        </div>

                        <button
                          onClick={() => supprimerChuteGeneree(c.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="number"
                      placeholder="Cote lue au ruban (ex: 1250 mm)"
                      value={nouvelleChuteGenereeLg}
                      onChange={e => setNouvelleChuteGenereeLg(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 w-60"
                    />
                    <button
                      onClick={ajouterChuteGenereeManuelle}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors"
                    >
                      + Ajouter au Rack
                    </button>
                  </div>
                </div>
              </div>

              {/* Colonne droite : Synthèse de Concordance & Validation 100% (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4 sticky top-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Scale className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-slate-100">
                      Bilan &amp; Contrôle de Concordance
                    </h3>
                  </div>

                  {/* Résumé métrique */}
                  <div className="space-y-2.5 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Besoin net pièces :</span>
                      <span className="font-mono font-bold text-slate-200">
                        {bilan.longueurTotaleRequiseMm} mm ({bilan.nbPiecesTotal} pcs)
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Traits de coupe estimés (4mm) :</span>
                      <span className="font-mono text-slate-300">+{bilan.traitScieEstimeMm} mm</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 font-bold border-t border-slate-800 pt-1.5">
                      <span>Besoin Réel Total :</span>
                      <span className="font-mono text-amber-400">
                        {bilan.longueurTotaleRequiseMm + bilan.traitScieEstimeMm} mm
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-400 pt-1">
                      <span>Matière brute fournie :</span>
                      <span className="font-mono font-bold text-blue-400">{bilan.matiereFournieMm} mm</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Chutes utiles créées (Rack) :</span>
                      <span className="font-mono text-emerald-400">
                        -{bilan.chutesGenereesReelles.filter(c => c.statut === 'A_STOCKER').reduce((s, c) => s + c.longueur, 0)} mm
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 font-bold border-t border-slate-800 pt-1.5">
                      <span>Solde matière disponible :</span>
                      <span className={`font-mono ${bilan.soldeMatiereMm >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Math.round(bilan.soldeMatiereMm)} mm
                      </span>
                    </div>
                  </div>

                  {/* Statut de validation */}
                  {bilan.couvertureEstValide ? (
                    <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 text-emerald-300 space-y-1">
                      <div className="flex items-center gap-2 font-black text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        CONCORDANCE 100% VALIDÉE
                      </div>
                      <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                        Toutes les pièces réelles de la commande sont entièrement couvertes par la matière déclarée. Vos stocks seront parfaitement exacts.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-red-300 space-y-1">
                      <div className="flex items-center gap-2 font-black text-xs">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        DÉFICIT MATIÈRE DÉTECTÉ
                      </div>
                      <p className="text-[11px] text-red-200/90 leading-relaxed">
                        {bilan.messageAlerte}
                      </p>
                    </div>
                  )}

                  {/* Bouton de clôture finale */}
                  <button
                    onClick={handleValiderClotureDefinitive}
                    disabled={!bilan.couvertureEstValide || isCloturing}
                    className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                      bilan.couvertureEstValide && !isCloturing
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-emerald-500/20 cursor-pointer active:scale-98'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isCloturing ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        Valider la Clôture &amp; Impacter les Stocks
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">
                    Génère les mouvements de stock réels et lève toutes les réservations temporaires.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
              Sélectionnez un Ordre de Fabrication en haut pour afficher son Bilan Matière.
            </div>
          )}
        </div>
      )}

      {/* ── VUE 2 : BANC DE TEST AUTOMATISÉ (8 SCÉNARIOS TERRAIN SIMULÉS) ── */}
      {subTab === 'SIMULATEUR' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                Vérification Automatique de Fiabilité (8 Cas Pratiques d'Atelier)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Simule les cas de déformation, remplacement de barres, annulation de chutes, multi-coupes et commandes modifiées.
              </p>
            </div>
            <button
              onClick={lancerSimulations}
              disabled={isSimulating}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              Relancer les 8 Simulations
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {simulations.map((s, idx) => (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-amber-400">Scénario #{idx + 1}</span>
                    <h4 className="text-sm font-bold text-slate-100 mt-0.5">{s.nomScenario}</h4>
                    <p className="text-xs text-slate-400 mt-1">{s.description}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${
                      s.succes
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 border-red-500/30'
                    }`}
                  >
                    {s.succes ? '100% SUCCÈS' : 'ÉCHEC'}
                  </span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-xs space-y-1">
                  <div className="text-emerald-300 font-medium">➔ {s.message}</div>
                  <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1 text-[11px]">
                    <div>Besoin Net : <b className="text-slate-200">{s.details.besoinNetMm} mm</b></div>
                    <div>Matière Fournie : <b className="text-slate-200">{s.details.matiereFournieMm} mm</b></div>
                    <div>Impact Barres : <b className="text-amber-400">{s.details.stockBarresNeuvesImpact}</b></div>
                    <div>Chutes Stockées : <b className="text-emerald-400">+{s.details.chutesStockeesCount}</b></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL : AJOUTER UNE CHUTE DU STOCK OU HORS-INVENTAIRE ── */}
      {showAddChuteModal && bilan && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                Ajouter une Chute Utilisée
              </h3>
              <button
                onClick={() => setShowAddChuteModal(false)}
                className="text-slate-400 hover:text-slate-100 text-xs font-bold"
              >
                Fermer ✕
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Option A : Chute du rack disponible */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Option 1 : Choisir dans le stock de chutes du rack
                </h4>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filtrer par longueur ou référence..."
                    value={chuteSearchQuery}
                    onChange={e => setChuteSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-800 rounded-lg p-2 bg-slate-950">
                  {chutesPlates
                    .filter(c => {
                      if (!chuteSearchQuery) return true;
                      return (
                        c.longueur.toString().includes(chuteSearchQuery) ||
                        (c.id && c.id.toLowerCase().includes(chuteSearchQuery.toLowerCase()))
                      );
                    })
                    .slice(0, 15)
                    .map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-900 hover:bg-slate-800 text-xs border border-slate-800 cursor-pointer"
                        onClick={() => ajouterChuteDuRack(c)}
                      >
                        <div>
                          <span className="font-bold text-amber-400 font-mono">{c.longueur} mm</span>
                          <span className="text-slate-400 ml-2">#{c.id}</span>
                          <span className="text-slate-500 ml-2 text-[10px]">({c.sheet_name})</span>
                        </div>
                        <button className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]">
                          Sélectionner
                        </button>
                      </div>
                    ))}
                  {chutesPlates.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      Aucune chute enregistrée en stock pour cette référence.
                    </div>
                  )}
                </div>
              </div>

              {/* Option B : Chute trouvée dans l'atelier non inventoriée */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  Option 2 : Déclarer une Chute Hors-Stock (Non inventoriée dans l'ordinateur)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Si vous avez trouvé une chute physique dans l'atelier qui n'était pas enregistrée, saisissez sa cote.
                  Le système ne fera pas de sortie négative sur votre stock.
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Longueur mesurée (mm, ex: 1750)"
                    value={nouvelleChuteHorsStockLg}
                    onChange={e => setNouvelleChuteHorsStockLg(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                  />
                  <input
                    type="text"
                    placeholder="Remarque (ex: trouvé sous rack)"
                    value={nouvelleChuteHorsStockRemarque}
                    onChange={e => setNouvelleChuteHorsStockRemarque(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                  />
                  <button
                    onClick={ajouterChuteHorsStock}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
