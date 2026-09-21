import React, { useState, useMemo } from 'react';
import {
  DossierCommandeGlobal,
  SuiviOF,
  Article,
  FamilleProduit
} from '../../types';
import {
  MonitoringService,
  DonneesMonitoringAtelier,
  LigneCommandeMonitoring,
  ClientMonitoringGroup,
  DetailFamilleClient,
  DetailTypeClient
} from '../../services/monitoringService';
import { StorageService } from '../../services/storage';
import { ParametresProductionModal } from '../common/ParametresProductionModal';
import { DossierDetailModal } from '../common/DossierDetailModal';
import {
  Activity,
  Layers,
  Scissors,
  Boxes,
  Maximize2,
  Calendar,
  Clock,
  Truck,
  Search,
  Filter,
  RefreshCw,
  Sliders,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Flag,
  TrendingUp,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info,
  Trash2,
  Building2,
  Users,
  LayoutGrid,
  ExternalLink,
  ShieldCheck,
  Check,
  FolderOpen,
  FileText,
  Eye,
  Pause,
  Play
} from 'lucide-react';

interface MonitoringAtelierTabProps {
  dossiers?: DossierCommandeGlobal[];
  suivisOF?: SuiviOF[];
  articles?: Article[];
  onRefreshData: () => void;
  onNavigateToTab: (tabId: string) => void;
  onLoadDossierInEcosysteme?: (dossier: DossierCommandeGlobal) => void;
}

export const MonitoringAtelierTab: React.FC<MonitoringAtelierTabProps> = ({
  dossiers = [],
  suivisOF = [],
  articles = [],
  onRefreshData,
  onNavigateToTab,
  onLoadDossierInEcosysteme
}) => {
  // Mode d'affichage strict et exclusif : POSTES D'USINAGE, PORTEFEUILLE CLIENTS, ou FILE DE FABRICATION
  const [modeVue, setModeVue] = useState<'FAMILLES' | 'CLIENTS' | 'COMMANDES'>('FAMILLES');

  // État modale dossier détail complet
  const [selectedDossierToView, setSelectedDossierToView] = useState<DossierCommandeGlobal | null>(null);
  const [isDossierDetailOpen, setIsDossierDetailOpen] = useState<boolean>(false);

  // Recherche du dossier associé à une ligne monitoring
  const getLinkedDossierForCmd = (cmd: LigneCommandeMonitoring): DossierCommandeGlobal | null => {
    if (!cmd) return null;
    const cmdRef = (cmd.refCommande || '').toLowerCase().trim();
    const cmdId = cmd.dossierId;

    if (cmdId) {
      const found = dossiers.find(d => d.id === cmdId);
      if (found) return found;
    }

    if (cmdRef) {
      const found = dossiers.find(d => {
        const ref = (d.refCommande || '').toLowerCase().trim();
        if (ref && (ref === cmdRef || ref.includes(cmdRef) || cmdRef.includes(ref))) return true;
        const subRefs = [
          d.numCommandeCaisson,
          d.numCommandeSousFace,
          d.numCommandeTablier,
          d.numCommandeMoustiquaire,
          d.numCommandePrecadre
        ].filter(Boolean) as string[];
        return subRefs.some(s => {
          const sub = s.toLowerCase().trim();
          return sub === cmdRef || cmdRef.includes(sub) || sub.includes(cmdRef);
        });
      });
      if (found) return found;
    }

    return null;
  };

  const handleRechargerDossier = (cmd: LigneCommandeMonitoring) => {
    const dossier = getLinkedDossierForCmd(cmd);
    if (dossier && onLoadDossierInEcosysteme) {
      onLoadDossierInEcosysteme(dossier);
    } else if (onNavigateToTab) {
      onNavigateToTab('ecosysteme');
    }
  };

  const handleVisualiserDossier = (cmd: LigneCommandeMonitoring) => {
    const dossier = getLinkedDossierForCmd(cmd);
    if (dossier) {
      setSelectedDossierToView(dossier);
      setIsDossierDetailOpen(true);
    }
  };

  const handleTogglePauseCmd = async (cmd: LigneCommandeMonitoring) => {
    const dossier = getLinkedDossierForCmd(cmd);
    const nowIso = new Date().toISOString();
    const isCurrentlyPaused = Boolean(cmd.estEnPause);
    const newPauseState = !isCurrentlyPaused;

    try {
      if (dossier) {
        const allDossiers = await StorageService.getDossiers();
        const d = allDossiers.find(item => item.id === dossier.id);
        if (d) {
          d.estEnPause = newPauseState;
          if (newPauseState) {
            d.statut = 'EN_PAUSE';
            d.datePause = nowIso;
            d.motifPause = 'Commande mise en pause depuis le Monitoring Atelier';
          } else {
            // Reprise en tête de file : priorité immédiate et horodatage pour dépasser les autres commandes
            d.statut = 'EN_COURS';
            d.datePause = undefined;
            d.motifPause = undefined;
            d.estPrioritaire = true;
            d.typePriorite = 'INSTANTANE';
            d.motifPriorite = 'Reprise d\'activité - Priorité absolue en tête de file';
            (d as any).repriseTimestamp = Date.now();
          }
          await StorageService.saveDossiers(allDossiers);
        }
      }

      const allOfs = await StorageService.getSuivisOF();
      const cmdRef = (cmd.refCommande || '').toLowerCase().trim();
      const cmdId = cmd.dossierId;

      const matchingOFs = allOfs.filter(o => {
        if (cmdId && o.dossierId === cmdId) return true;
        const oCmd = (o.numCommande || '').toLowerCase().trim();
        return oCmd && (oCmd === cmdRef || oCmd.includes(cmdRef) || cmdRef.includes(oCmd));
      });

      for (const of of matchingOFs) {
        if (newPauseState) {
          await StorageService.mettreAJourStatutOF(
            of.id,
            'EN_PAUSE',
            undefined,
            true,
            'Mis en pause depuis le monitoring'
          );
        } else {
          // Reprise : réactivation de l'OF en priorité absolue en tête de file
          const statutActif = of.lignesRetour && of.lignesRetour.length > 0 ? 'RETOUR_EN_ATTENTE' : 'EMIS';
          const updatedOF: SuiviOF = {
            ...of,
            statut: statutActif,
            estEnPause: false,
            datePause: undefined,
            motifPause: undefined,
            estPrioritaire: true,
            typePriorite: 'INSTANTANE',
            motifPriorite: 'Reprise d\'activité - Priorité absolue en tête de file',
            dateReprise: nowIso
          };
          (updatedOF as any).repriseTimestamp = Date.now();
          await StorageService.upsertSuiviOF(updatedOF);
        }
      }

      onRefreshData();
    } catch (err) {
      console.error('Erreur lors du basculement pause dans le monitoring:', err);
    }
  };

  // Filtres file commandes
  const [recherche, setRecherche] = useState<string>('');
  const [filtreFamille, setFiltreFamille] = useState<string>('TOUTES');
  const [filtreSousType, setFiltreSousType] = useState<string>('TOUS');
  const [filtreRetard, setFiltreRetard] = useState<'TOUS' | 'RETARD_CRITIQUE' | 'TOUT_RETARD'>('TOUS');

  // Filtres et état vue clients
  const [rechercheClient, setRechercheClient] = useState<string>('');
  const [clientsDeplies, setClientsDeplies] = useState<Record<string, boolean>>({});

  // Modale paramètres
  const [isParamsModalOpen, setIsParamsModalOpen] = useState<boolean>(false);

  // Calcul du monitoring en temps réel
  const monitoringData: DonneesMonitoringAtelier = useMemo(() => {
    return MonitoringService.calculerMonitoring(dossiers, suivisOF, articles);
  }, [dossiers, suivisOF, articles]);

  const { caissons, tabliers, precadres, moustiquaires } = monitoringData;

  // Clients filtrés
  const clientsFiltres = useMemo(() => {
    const list = monitoringData.clientsMonitoring || [];
    if (!rechercheClient.trim()) return list;
    const q = rechercheClient.toLowerCase().trim();
    return list.filter(c =>
      (c.nomClient || '').toLowerCase().includes(q) ||
      (c.donneurOrdre || '').toLowerCase().includes(q) ||
      (c.familles || []).some(f =>
        (f.labelFamille || '').toLowerCase().includes(q) ||
        (f.types || []).some(t => (t.label || '').toLowerCase().includes(q))
      ) ||
      (c.commandes || []).some(cmd => (cmd.refCommande || '').toLowerCase().includes(q))
    );
  }, [monitoringData.clientsMonitoring, rechercheClient]);

  const isClientDeplie = (nomClient: string) => {
    return clientsDeplies[nomClient] !== false; // Déplié par défaut
  };

  const toggleClientDeplie = (nomClient: string) => {
    setClientsDeplies(prev => ({
      ...prev,
      [nomClient]: prev[nomClient] !== undefined ? !prev[nomClient] : false
    }));
  };

  const setToutDeplier = (deplier: boolean) => {
    const next: Record<string, boolean> = {};
    (monitoringData.clientsMonitoring || []).forEach(c => {
      next[c.nomClient] = deplier;
    });
    setClientsDeplies(next);
  };

  // Commandes filtrées
  const commandesFiltrees = useMemo(() => {
    return (monitoringData.commandesActives || []).filter(cmd => {
      if (filtreRetard === 'RETARD_CRITIQUE' && !cmd.alerteDelai?.estRetardCritique) return false;
      if (filtreRetard === 'TOUT_RETARD' && !cmd.alerteDelai?.estDepasse) return false;
      if (filtreFamille !== 'TOUTES' && cmd.famille !== filtreFamille) return false;

      if (filtreSousType !== 'TOUS') {
        const cles: string[] = (cmd.sousTypesCles && cmd.sousTypesCles.length > 0)
          ? cmd.sousTypesCles
          : (cmd.sousTypeCle ? [cmd.sousTypeCle] : []);

        if (cles.length > 0) {
          if (!cles.includes(filtreSousType)) return false;
        } else {
          const p = (cmd.typePrecision || '').toUpperCase();
          if (filtreSousType === 'CAISSON_30' && !(/\b30\b|CAISSON\s*30/i.test(p))) return false;
          if (filtreSousType === 'CAISSON_25' && !(/\b25\b|CAISSON\s*25/i.test(p))) return false;
          if (filtreSousType === 'CAISSON_40' && !(/\b40\b|CAISSON\s*40/i.test(p))) return false;
          if (filtreSousType === 'TABLIER_43' && !(/\b43\b|LAME\s*43/i.test(p))) return false;
          if (filtreSousType === 'TABLIER_55' && !(/\b55\b|LAME\s*55/i.test(p))) return false;
          if (filtreSousType === 'PRECADRE_36' && !(/\b36\b|PRECADRE\s*36/i.test(p))) return false;
          if (filtreSousType === 'PRECADRE_50' && !(/\b50\b|PRECADRE\s*50/i.test(p))) return false;
          if (filtreSousType === 'MSTQ_PORTE_FENETRE' && !(p.includes('PORTE') || p.includes('PF'))) return false;
          if (filtreSousType === 'MSTQ_FENETRE' && (p.includes('PORTE') || !(p.includes('FENETRE') || p.includes('FENÊTRE') || p.includes('1 VANTAIL')))) return false;
        }
      }

      if (recherche.trim()) {
        const q = recherche.toLowerCase().trim();
        const matchRef = (cmd.refCommande || '').toLowerCase().includes(q);
        const matchClient = (cmd.client || '').toLowerCase().includes(q);
        const matchDonneur = (cmd.donneurOrdre || '').toLowerCase().includes(q);
        const matchDetail = (cmd.detailArticles || '').toLowerCase().includes(q);
        const matchType = (cmd.typePrecision || '').toLowerCase().includes(q);
        const matchOf = (cmd.ofCode || '').toLowerCase().includes(q);
        if (!matchRef && !matchClient && !matchDonneur && !matchDetail && !matchType && !matchOf) {
          return false;
        }
      }
      return true;
    });
  }, [monitoringData.commandesActives, filtreFamille, filtreSousType, filtreRetard, recherche]);

  // Basculer vers la file des commandes filtrée sur une famille
  const basculerVersCommandesFamille = (familleKey: string, sousTypeKey: string = 'TOUS') => {
    setFiltreFamille(familleKey);
    setFiltreSousType(sousTypeKey);
    setModeVue('COMMANDES');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* ── 1. LES 4 INDICATEURS CLÉS ESSENTIELS DE L'ATELIER (KPIS NETS) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1 : Commandes en Cours */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Commandes Actives</span>
            <Boxes className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-3xl font-black text-slate-100 font-mono tracking-tight">
              {monitoringData.totalCommandesActives}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap font-medium">
              <span className="text-amber-400 font-bold">{caissons.nbCommandesEnCours} Cais.</span> •{' '}
              <span className="text-sky-400 font-bold">{tabliers.nbCommandesEnCours} Tabl.</span> •{' '}
              <span className="text-purple-400 font-bold">{precadres.nbCommandesEnCours} Préc.</span> •{' '}
              <span className="text-emerald-400 font-bold">{moustiquaires.nbCommandesEnCours} Mstq.</span>
            </div>
          </div>
        </div>

        {/* KPI 2 : Total Pièces Réelles à Fabriquer */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Total Pièces à Fabriquer</span>
            <Scissors className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-3xl font-black text-emerald-400 font-mono tracking-tight">
              {monitoringData.totalPiecesEnFabrication} <span className="text-base font-normal text-emerald-400/70">pcs</span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-amber-400 font-semibold">{caissons.totalPiecesEnCours} Cais.</span> •{' '}
              <span className="text-sky-400 font-semibold">{tabliers.totalPiecesEnCours} Tabl.</span> •{' '}
              <span className="text-purple-400 font-semibold">{precadres.totalPiecesEnCours} Préc.</span> •{' '}
              <span className="text-emerald-400 font-semibold">{moustiquaires.totalPiecesEnCours} Mstq.</span>
            </div>
          </div>
        </div>

        {/* KPI 3 : Clients en File */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Clients en Production</span>
            <Building2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-3xl font-black text-amber-300 font-mono tracking-tight">
              {monitoringData.clientsMonitoring?.length || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1 truncate">
              {monitoringData.clientsMonitoring && monitoringData.clientsMonitoring.length > 0
                ? `Principal : ${monitoringData.clientsMonitoring[0].nomClient} (${monitoringData.clientsMonitoring[0].totalPieces} pcs)`
                : 'Aucune commande en attente'}
            </div>
          </div>
        </div>

        {/* KPI 4 : Charge Globale & Respect des Délais */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Charge &amp; Délais Atelier</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-sky-300 font-mono tracking-tight">
              {monitoringData.chargeTotaleHeures} h
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span className="truncate font-medium">{monitoringData.dateLivraisonGlobaleJusquAu}</span>
              {monitoringData.totalRetardCritiqueAVerifier > 0 ? (
                <span
                  onClick={() => {
                    setFiltreRetard('RETARD_CRITIQUE');
                    setModeVue('COMMANDES');
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700 cursor-pointer hover:bg-rose-900 transition"
                  title="Cliquez pour filtrer les commandes avec retard > 3j"
                >
                  🚨 {monitoringData.totalRetardCritiqueAVerifier} retard(s)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  ✓ Dans les délais
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. SÉLECTEUR DE VUE EXCLUSIF (CLARTÉ & SÉPARATION TOTALE) ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">
            Mode d'Affichage :
          </span>
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setModeVue('FAMILLES')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                modeVue === 'FAMILLES'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>🏭 Postes &amp; Familles d'Usinage</span>
            </button>

            <button
              onClick={() => setModeVue('CLIENTS')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                modeVue === 'CLIENTS'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>🏢 Suivi par Client</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                modeVue === 'CLIENTS' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {monitoringData.clientsMonitoring?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setModeVue('COMMANDES')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                modeVue === 'COMMANDES'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>📋 File de Fabrication des Commandes</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                modeVue === 'COMMANDES' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {commandesFiltrees.length}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <div className="text-xs text-slate-400 pr-2 hidden xl:flex items-center gap-1.5">
            <strong className="text-emerald-400 font-mono font-bold">{monitoringData.totalPiecesEnFabrication} pcs</strong>
            <span>•</span>
            <strong className="text-amber-300 font-mono font-bold">{monitoringData.totalCommandesActives} cmd</strong>
          </div>

          <button
            onClick={() => setIsParamsModalOpen(true)}
            className="px-2.5 py-1.5 text-xs font-semibold text-sky-300 bg-sky-950/50 hover:bg-sky-900/60 rounded-xl transition border border-sky-500/40 flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Ajuster les cadences journalières de coupe et les jours ouvrés"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Cadences</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm print:hidden"
            title="Imprimer le rapport de monitoring A4"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Imprimer</span>
          </button>

          <button
            onClick={onRefreshData}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Actualiser les données"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VUE 1 : POSTES & FAMILLES D'USINAGE (LE CŒUR INDUSTRIEL DE L'ATELIER)   */}
      {/* ========================================================================= */}
      {modeVue === 'FAMILLES' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 📦 POSTE 1 : CAISSONS & COFFRES */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-amber-500/40 transition">
              <div>
                {/* Entête Poste */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      📦
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <span>Poste Caissons &amp; Sous-Faces</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          {caissons.nbCommandesEnCours} cmd(s)
                        </span>
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Échéance prévisionnelle : <strong className="text-amber-300 font-mono">{caissons.dateLivraisonJusquAu}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-amber-300 font-mono">
                      {caissons.totalPiecesEnCours} <span className="text-xs font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Charge : {caissons.chargeHeuresEstimee}h ({caissons.capaciteJournaliere} pcs/j)
                    </div>
                  </div>
                </div>

                {/* Décomposition par Type de Caisson */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4">
                  <div
                    onClick={() => basculerVersCommandesFamille('CAISSON', 'CAISSON_30')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-amber-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Caisson 30 (300mm)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {caissons.detailsCaissons?.c30.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-amber-400/80 mt-0.5 font-mono">
                      {caissons.detailsCaissons?.c30.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('CAISSON', 'CAISSON_25')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-amber-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Caisson 25 (250mm)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {caissons.detailsCaissons?.c25.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-amber-400/80 mt-0.5 font-mono">
                      {caissons.detailsCaissons?.c25.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('CAISSON', 'CAISSON_40')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-amber-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Caisson 40 (400mm)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {caissons.detailsCaissons?.c40.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-amber-400/80 mt-0.5 font-mono">
                      {caissons.detailsCaissons?.c40.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('CAISSON', 'AUTRE')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-amber-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Sous-Faces &amp; Autres</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {caissons.detailsCaissons?.autres.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-amber-400/80 mt-0.5 font-mono">
                      {caissons.detailsCaissons?.autres.nbCommandes || 0} cmd(s)
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Poste Caissons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => basculerVersCommandesFamille('CAISSON')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                  <span>Voir les commandes Caissons</span>
                </button>

                <button
                  onClick={() => onNavigateToTab('caisson')}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Accéder au module Caisson</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 🪟 POSTE 2 : TABLIERS VOLETS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-sky-500/40 transition">
              <div>
                {/* Entête Poste */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                      🪟
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <span>Poste Tabliers de Volet</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800">
                          {tabliers.nbCommandesEnCours} cmd(s)
                        </span>
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Échéance prévisionnelle : <strong className="text-sky-300 font-mono">{tabliers.dateLivraisonJusquAu}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-sky-300 font-mono">
                      {tabliers.totalPiecesEnCours} <span className="text-xs font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Charge : {tabliers.chargeHeuresEstimee}h ({tabliers.capaciteJournaliere} pcs/j)
                    </div>
                  </div>
                </div>

                {/* Décomposition par Type de Lame */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-4">
                  <div
                    onClick={() => basculerVersCommandesFamille('TABLIER', 'TABLIER_43')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-sky-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Lame 43 (DP43)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {tabliers.detailsTabliers?.l43.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-sky-400/80 mt-0.5 font-mono">
                      {tabliers.detailsTabliers?.l43.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('TABLIER', 'TABLIER_55')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-sky-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Lame 55 (DP55)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {tabliers.detailsTabliers?.l55.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-sky-400/80 mt-0.5 font-mono">
                      {tabliers.detailsTabliers?.l55.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('TABLIER', 'AUTRE')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-sky-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Autres Profilés Tablier</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {tabliers.detailsTabliers?.autres.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-sky-400/80 mt-0.5 font-mono">
                      {tabliers.detailsTabliers?.autres.nbCommandes || 0} cmd(s)
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Poste Tabliers */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => basculerVersCommandesFamille('TABLIER')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
                  <span>Voir les commandes Tabliers</span>
                </button>

                <button
                  onClick={() => onNavigateToTab('tablier')}
                  className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Accéder au module Tablier</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 🚪 POSTE 3 : PRÉCADRES ALUMINIUM */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-purple-500/40 transition">
              <div>
                {/* Entête Poste */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                      🚪
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <span>Poste Précadres Aluminium</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                          {precadres.nbCommandesEnCours} cmd(s)
                        </span>
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Échéance prévisionnelle : <strong className="text-purple-300 font-mono">{precadres.dateLivraisonJusquAu}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-purple-300 font-mono">
                      {precadres.totalPiecesEnCours} <span className="text-xs font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Charge : {precadres.chargeHeuresEstimee}h ({precadres.capaciteJournaliere} pcs/j)
                    </div>
                  </div>
                </div>

                {/* Décomposition par Type de Précadre */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-4">
                  <div
                    onClick={() => basculerVersCommandesFamille('PRECADRE', 'PRECADRE_36')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-purple-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Précadre 36 mm (P36)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {precadres.detailsPrecadres?.p36.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-purple-400/80 mt-0.5 font-mono">
                      {precadres.detailsPrecadres?.p36.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('PRECADRE', 'PRECADRE_50')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-purple-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Précadre 50 mm (P50)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {precadres.detailsPrecadres?.p50.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-purple-400/80 mt-0.5 font-mono">
                      {precadres.detailsPrecadres?.p50.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('PRECADRE', 'AUTRE')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-purple-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Autres Profilés</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {precadres.detailsPrecadres?.autres.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-purple-400/80 mt-0.5 font-mono">
                      {precadres.detailsPrecadres?.autres.nbCommandes || 0} cmd(s)
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Poste Précadres */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => basculerVersCommandesFamille('PRECADRE')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
                  <span>Voir les commandes Précadres</span>
                </button>

                <button
                  onClick={() => onNavigateToTab('precadre')}
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Accéder au module Précadre</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 🦟 POSTE 4 : MOUSTIQUAIRES */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-emerald-500/40 transition">
              <div>
                {/* Entête Poste */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                      🦟
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <span>Poste Moustiquaires</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {moustiquaires.nbCommandesEnCours} cmd(s)
                        </span>
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Échéance prévisionnelle : <strong className="text-emerald-300 font-mono">{moustiquaires.dateLivraisonJusquAu}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-emerald-300 font-mono">
                      {moustiquaires.totalPiecesEnCours} <span className="text-xs font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Charge : {moustiquaires.chargeHeuresEstimee}h ({moustiquaires.capaciteJournaliere} pcs/j)
                    </div>
                  </div>
                </div>

                {/* Décomposition par Type de Moustiquaire */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-4">
                  <div
                    onClick={() => basculerVersCommandesFamille('MOUSTIQUAIRE', 'MSTQ_FENETRE')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-emerald-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Fenêtre (1 Vantail)</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {moustiquaires.detailsMoustiquaires?.fenetre.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">
                      {moustiquaires.detailsMoustiquaires?.fenetre.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('MOUSTIQUAIRE', 'MSTQ_PORTE_FENETRE')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-emerald-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Porte-Fenêtre</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {moustiquaires.detailsMoustiquaires?.porteFenetre.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">
                      {moustiquaires.detailsMoustiquaires?.porteFenetre.nbCommandes || 0} cmd(s)
                    </div>
                  </div>

                  <div
                    onClick={() => basculerVersCommandesFamille('MOUSTIQUAIRE', 'AUTRE')}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 hover:border-emerald-500/50 cursor-pointer transition"
                  >
                    <div className="text-[11px] font-semibold text-slate-400 truncate">Autres Modèles</div>
                    <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                      {moustiquaires.detailsMoustiquaires?.autres.totalPieces || 0} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                    </div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">
                      {moustiquaires.detailsMoustiquaires?.autres.nbCommandes || 0} cmd(s)
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Poste Moustiquaires */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => basculerVersCommandesFamille('MOUSTIQUAIRE')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Voir les commandes Moustiquaires</span>
                </button>

                <button
                  onClick={() => onNavigateToTab('moustiquaire')}
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Accéder au module Moustiquaire</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 2 : PORTEFEUILLE PAR CLIENT (VENTILATION CLAIRE, PROPRE, SANS DOUBLON) */}
      {/* ========================================================================= */}
      {modeVue === 'CLIENTS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barre de Recherche & Contrôles Clients */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rechercheClient}
                onChange={e => setRechercheClient(e.target.value)}
                placeholder="Rechercher par client, donneur d'ordre, référence commande..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setToutDeplier(true)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 cursor-pointer flex items-center gap-1.5"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Tout Déplier</span>
              </button>
              <button
                onClick={() => setToutDeplier(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 cursor-pointer flex items-center gap-1.5"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Tout Replier</span>
              </button>
            </div>
          </div>

          {/* Liste des Cartes Clients */}
          {clientsFiltres.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs rounded-2xl bg-slate-900 border border-slate-800">
              Aucun client ne correspond aux critères de recherche actuels.
            </div>
          ) : (
            <div className="space-y-3">
              {clientsFiltres.map((client, idx) => {
                const estDeplie = isClientDeplie(client.nomClient);
                const partPourcentage = monitoringData.totalPiecesEnFabrication > 0
                  ? Math.round((client.totalPieces / monitoringData.totalPiecesEnFabrication) * 100)
                  : 0;

                return (
                  <div
                    key={client.nomClient || idx}
                    className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-md transition hover:border-slate-700"
                  >
                    {/* En-tête Client Synthétique et Impeccable */}
                    <div
                      onClick={() => toggleClientDeplie(client.nomClient)}
                      className="p-4 bg-slate-900 hover:bg-slate-850 cursor-pointer flex flex-wrap items-center justify-between gap-4 select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                          {estDeplie ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-bold text-slate-100">
                              {client.nomClient}
                            </h4>
                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                              Donneur : {client.donneurOrdre}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Volume : <strong className="text-amber-300 font-mono">{partPourcentage}%</strong> de la production globale de l'atelier
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Badges de synthèse par famille */}
                        <div className="hidden lg:flex items-center gap-2">
                          {client.familles.map(f => (
                            <span
                              key={f.famille}
                              className={`text-[11px] px-2.5 py-1 rounded-lg font-mono font-bold border ${
                                f.famille === 'CAISSON'
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/80'
                                  : f.famille === 'TABLIER'
                                  ? 'bg-sky-950/60 text-sky-300 border-sky-800/80'
                                  : f.famille === 'PRECADRE'
                                  ? 'bg-purple-950/60 text-purple-300 border-purple-800/80'
                                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
                              }`}
                            >
                              {f.famille === 'CAISSON' ? '📦 Cais' : f.famille === 'TABLIER' ? '🪟 Tabl' : f.famille === 'PRECADRE' ? '🚪 Préc' : '🦟 Mstq'} : {f.totalPieces} pcs
                            </span>
                          ))}
                        </div>

                        {/* Total Commandes */}
                        <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-right">
                          <div className="text-[10px] uppercase font-semibold text-slate-400">Commandes</div>
                          <div className="text-xs font-mono font-bold text-sky-400">
                            {client.totalCommandesEnCours} cmd
                          </div>
                        </div>

                        {/* Total Pièces à Fabriquer */}
                        <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-right">
                          <div className="text-[10px] uppercase font-bold text-amber-400">Pièces à fabriquer</div>
                          <div className="text-sm font-mono font-black text-amber-300">
                            {client.totalPieces} pcs
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Contenu Déplié : Détail par Famille & Tableau des Commandes */}
                    {estDeplie && (
                      <div className="p-4 border-t border-slate-800/80 bg-slate-950/50 space-y-4">
                        {/* 1. Résumé des Besoins par Famille et Sous-Types */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {client.familles.map(f => (
                            <div
                              key={f.famille}
                              className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs">
                                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <span>{f.famille === 'CAISSON' ? '📦' : f.famille === 'TABLIER' ? '🪟' : f.famille === 'PRECADRE' ? '🚪' : '🦟'}</span>
                                  <span>{f.labelFamille}</span>
                                </span>
                                <span className="font-mono font-black text-amber-300 text-xs">
                                  {f.totalPieces} pcs
                                </span>
                              </div>

                              <div className="space-y-1 text-xs">
                                {f.types.map(t => (
                                  <div key={t.cle} className="flex items-center justify-between text-slate-400 text-[11px]">
                                    <span className="truncate pr-1">{t.label} :</span>
                                    <span className="font-mono font-bold text-slate-200 whitespace-nowrap">{t.totalPieces} pcs</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 2. Liste des Commandes associées à ce Client */}
                        <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900">
                          <div className="p-2.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-300">
                            <span>Commandes en cours pour {client.nomClient} ({client.commandes.length})</span>
                            <span className="text-[11px] text-slate-400 font-normal">Triées par date de livraison</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                                <tr>
                                  <th className="py-2.5 px-3">Réf Commande</th>
                                  <th className="py-2.5 px-3">Date Émission Commande</th>
                                  <th className="py-2.5 px-3">Famille &amp; Type</th>
                                  <th className="py-2.5 px-3 text-right">Qté Pièces</th>
                                  <th className="py-2.5 px-3">Date Prévue</th>
                                  <th className="py-2.5 px-3">Statut Délai</th>
                                  <th className="py-2.5 px-3 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-mono">
                                {client.commandes.map(cmd => (
                                  <tr key={cmd.id} className="hover:bg-slate-800/40 transition">
                                    <td className="py-2 px-3 font-bold text-amber-300">
                                      {cmd.refCommande}
                                    </td>
                                    <td className="py-2 px-3 text-slate-300 font-sans">
                                      {cmd.dateEmission || cmd.dateCommande || '—'}
                                    </td>
                                    <td className="py-2 px-3 font-sans text-slate-200">
                                      <span className="font-semibold">{cmd.statutBadgeLabel}</span>
                                      {cmd.typePrecision && (
                                        <span className="text-slate-400 text-[11px] ml-1.5">({cmd.typePrecision})</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right font-black text-emerald-400">
                                      {cmd.quantiteTotalPieces} pcs
                                    </td>
                                    <td className="py-2 px-3 text-slate-300 font-sans">
                                      {cmd.dateLivraisonPrevisionnelle}
                                    </td>
                                    <td className="py-2 px-3 font-sans">
                                      {cmd.alerteDelai?.estRetardCritique ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                                          🚨 À Vérifier (+{cmd.alerteDelai.joursDeRetard}j)
                                        </span>
                                      ) : cmd.alerteDelai?.estDepasse ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                                          ⚠️ Retard (+{cmd.alerteDelai.joursDeRetard}j)
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                          ✓ Dans les délais
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleRechargerDossier(cmd)}
                                          className="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-600/60 text-[11px] font-sans font-bold rounded transition cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                          title="Recharger cette commande dans l'Écosystème Commandes"
                                        >
                                          <FolderOpen className="w-3 h-3 text-amber-400" />
                                          <span>Écosystème</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (cmd.famille === 'CAISSON') onNavigateToTab('caisson');
                                            else if (cmd.famille === 'TABLIER') onNavigateToTab('tablier');
                                            else if (cmd.famille === 'PRECADRE') onNavigateToTab('precadre');
                                            else if (cmd.famille === 'MOUSTIQUAIRE') onNavigateToTab('moustiquaire');
                                            else onNavigateToTab('ordres');
                                          }}
                                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-sans font-semibold rounded transition cursor-pointer inline-flex items-center gap-1 border border-slate-700"
                                          title="Ouvrir au poste de fabrication"
                                        >
                                          <span>Poste</span>
                                          <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 3 : FILE CHRONOLOGIQUE DES COMMANDES (PLANNING & EXÉCUTION ATELIER)    */}
      {/* ========================================================================= */}
      {modeVue === 'COMMANDES' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          {/* Filtres & Recherche de la file */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-400 uppercase mr-1">Famille :</span>
              <button
                onClick={() => {
                  setFiltreFamille('TOUTES');
                  setFiltreSousType('TOUS');
                }}
                className={`px-3 py-1.5 text-xs rounded-xl font-bold transition cursor-pointer ${
                  filtreFamille === 'TOUTES'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Toutes ({monitoringData.totalCommandesActives})
              </button>

              <button
                onClick={() => {
                  setFiltreFamille('CAISSON');
                  setFiltreSousType('TOUS');
                }}
                className={`px-3 py-1.5 text-xs rounded-xl font-bold transition cursor-pointer ${
                  filtreFamille === 'CAISSON'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 text-amber-400 hover:bg-slate-850 border border-slate-800'
                }`}
              >
                📦 Caissons ({caissons.nbCommandesEnCours})
              </button>

              <button
                onClick={() => {
                  setFiltreFamille('TABLIER');
                  setFiltreSousType('TOUS');
                }}
                className={`px-3 py-1.5 text-xs rounded-xl font-bold transition cursor-pointer ${
                  filtreFamille === 'TABLIER'
                    ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                    : 'bg-slate-950 text-sky-400 hover:bg-slate-850 border border-slate-800'
                }`}
              >
                🪟 Tabliers ({tabliers.nbCommandesEnCours})
              </button>

              <button
                onClick={() => {
                  setFiltreFamille('PRECADRE');
                  setFiltreSousType('TOUS');
                }}
                className={`px-3 py-1.5 text-xs rounded-xl font-bold transition cursor-pointer ${
                  filtreFamille === 'PRECADRE'
                    ? 'bg-purple-500 text-slate-950 shadow-md shadow-purple-500/20'
                    : 'bg-slate-950 text-purple-400 hover:bg-slate-850 border border-slate-800'
                }`}
              >
                🚪 Précadres ({precadres.nbCommandesEnCours})
              </button>

              <button
                onClick={() => {
                  setFiltreFamille('MOUSTIQUAIRE');
                  setFiltreSousType('TOUS');
                }}
                className={`px-3 py-1.5 text-xs rounded-xl font-bold transition cursor-pointer ${
                  filtreFamille === 'MOUSTIQUAIRE'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-950 text-emerald-400 hover:bg-slate-850 border border-slate-800'
                }`}
              >
                🦟 Moustiquaires ({moustiquaires.nbCommandesEnCours})
              </button>
            </div>

            {/* Filtre Délais */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase mr-1">Délais :</span>
              <button
                onClick={() => setFiltreRetard('TOUS')}
                className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition cursor-pointer ${
                  filtreRetard === 'TOUS'
                    ? 'bg-slate-200 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setFiltreRetard('RETARD_CRITIQUE')}
                className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition cursor-pointer ${
                  filtreRetard === 'RETARD_CRITIQUE'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'bg-slate-950 text-rose-400 hover:bg-rose-950/40 border border-slate-800'
                }`}
              >
                🚨 Retard &gt; 3j ({monitoringData.totalRetardCritiqueAVerifier})
              </button>
            </div>
          </div>

          {/* Barre de Recherche rapide dans la table */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder="Rechercher par N° commande, client, code OF, référence d'article..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="text-xs text-slate-400 font-medium">
              Affichage de <strong className="text-slate-100">{commandesFiltrees.length}</strong> commande(s)
            </div>
          </div>

          {/* Tableau Exhaustif & Structuré */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950 shadow-inner">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3.5">N° Commande</th>
                    <th className="py-3 px-3">Date Émission Commande</th>
                    <th className="py-3 px-3.5">Client &amp; Donneur d'Ordre</th>
                    <th className="py-3 px-3.5">Famille &amp; Spécification</th>
                    <th className="py-3 px-3 text-right">Qté Pièces</th>
                    <th className="py-3 px-3">Code OF</th>
                    <th className="py-3 px-3.5">Livraison Prévue</th>
                    <th className="py-3 px-3.5">Statut Atelier</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {commandesFiltrees.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500 font-sans italic">
                        Aucune commande ne correspond aux filtres actifs.
                      </td>
                    </tr>
                  ) : (
                    commandesFiltrees.map(cmd => (
                      <tr key={cmd.id} className="hover:bg-slate-900/60 transition">
                        <td className="py-2.5 px-3.5 font-bold text-amber-300 whitespace-nowrap">
                          {cmd.refCommande}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans whitespace-nowrap">
                          {cmd.dateEmission || cmd.dateCommande || '—'}
                        </td>
                        <td className="py-2.5 px-3.5 font-sans">
                          <div className="font-bold text-slate-200">{cmd.client}</div>
                          <div className="text-[11px] text-slate-500">{cmd.donneurOrdre}</div>
                        </td>
                        <td className="py-2.5 px-3.5 font-sans">
                          <div className="font-bold text-slate-200 flex items-center gap-1.5">
                            <span>{cmd.famille === 'CAISSON' ? '📦' : cmd.famille === 'TABLIER' ? '🪟' : cmd.famille === 'PRECADRE' ? '🚪' : '🦟'}</span>
                            <span>{cmd.famille === 'CAISSON' ? 'Caisson' : cmd.famille === 'TABLIER' ? 'Tablier' : cmd.famille === 'PRECADRE' ? 'Précadre' : 'Moustiquaire'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{cmd.typePrecision}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-400 text-sm whitespace-nowrap">
                          {cmd.quantiteTotalPieces} pcs
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                          {cmd.ofCode ? (
                            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300 font-bold">
                              {cmd.ofCode}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 font-sans whitespace-nowrap">
                          <div className="font-bold text-slate-200">{cmd.dateLivraisonPrevisionnelle}</div>
                          <div>
                            {cmd.alerteDelai?.estRetardCritique ? (
                              <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                                🚨 À Vérifier (+{cmd.alerteDelai.joursDeRetard}j)
                              </span>
                            ) : cmd.alerteDelai?.estDepasse ? (
                              <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                                ⚠️ Retard (+{cmd.alerteDelai.joursDeRetard}j)
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
                                ✓ Dans les délais
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 font-sans whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                            cmd.estEnPause || cmd.statutAtelier === 'EN_PAUSE'
                              ? 'bg-amber-950/90 text-amber-300 border-amber-500/60 shadow-xs'
                              : cmd.statutAtelier === 'OF_CLOTURE'
                              ? 'bg-slate-800 text-slate-300 border-slate-700'
                              : cmd.statutAtelier === 'PRET_LIVRAISON'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : cmd.statutAtelier === 'COUPE_EN_COURS'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-sky-950 text-sky-300 border-sky-800'
                          }`}>
                            {cmd.estEnPause || cmd.statutAtelier === 'EN_PAUSE' ? '⏸️ EN PAUSE' : cmd.statutAtelier}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Recharger dans Écosystème */}
                            <button
                              type="button"
                              onClick={() => handleRechargerDossier(cmd)}
                              className="px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-600/60 text-xs font-sans font-bold rounded-lg transition cursor-pointer inline-flex items-center gap-1 shadow-xs"
                              title="Recharger cette commande dans l'Écosystème Commandes (lignes, articles, délais)"
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                              <span>Écosystème</span>
                            </button>

                            {/* Détails modale */}
                            {getLinkedDossierForCmd(cmd) && (
                              <button
                                type="button"
                                onClick={() => handleVisualiserDossier(cmd)}
                                className="px-2 py-1.5 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/60 text-xs font-sans font-semibold rounded-lg transition cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                title="Visualiser le dossier complet et ses repères"
                              >
                                <FileText className="w-3 h-3 text-purple-400" />
                                <span className="hidden sm:inline">Détails</span>
                              </button>
                            )}

                            {/* Bouton Cmd Pause / Reprendre (Remplace Poste) */}
                            <button
                              type="button"
                              onClick={() => handleTogglePauseCmd(cmd)}
                              className={`px-2.5 py-1.5 text-xs font-sans font-bold rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 shadow-xs border ${
                                cmd.estEnPause
                                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/60 shadow-md shadow-emerald-950/40 animate-pulse'
                                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/50 hover:border-amber-400'
                              }`}
                              title={
                                cmd.estEnPause
                                  ? 'Reprendre cette commande : la propulse en tête de file absolue et recale automatiquement les autres commandes'
                                  : 'Mettre cette commande en pause (libère immédiatement le temps machine pour les autres commandes de la file)'
                              }
                            >
                              {cmd.estEnPause ? (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                                  <span>Reprendre (Tête de file)</span>
                                </>
                              ) : (
                                <>
                                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Cmd Pause</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modale de réglage des cadences */}
      <ParametresProductionModal
        isOpen={isParamsModalOpen}
        onClose={() => setIsParamsModalOpen(false)}
        onSaved={onRefreshData}
      />

      {/* ── Modal Visualisation Commande Complète ── */}
      <DossierDetailModal
        isOpen={isDossierDetailOpen}
        onClose={() => {
          setIsDossierDetailOpen(false);
          setSelectedDossierToView(null);
        }}
        dossier={selectedDossierToView}
        onLoadInEcosysteme={(d) => {
          setIsDossierDetailOpen(false);
          if (onLoadDossierInEcosysteme) {
            onLoadDossierInEcosysteme(d);
          } else if (onNavigateToTab) {
            onNavigateToTab('ecosysteme');
          }
        }}
      />
    </div>
  );
};
