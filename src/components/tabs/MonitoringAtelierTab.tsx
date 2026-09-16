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
  LigneCommandeMonitoring
} from '../../services/monitoringService';
import { StorageService } from '../../services/storage';
import { ParametresProductionModal } from '../common/ParametresProductionModal';
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
  ShieldAlert,
  TrendingUp,
  FileSpreadsheet,
  ChevronRight,
  ArrowRight,
  Flame,
  Info,
  Trash2,
  PlusCircle
} from 'lucide-react';

interface MonitoringAtelierTabProps {
  dossiers?: DossierCommandeGlobal[];
  suivisOF?: SuiviOF[];
  articles?: Article[];
  onRefreshData: () => void;
  onNavigateToTab: (tabId: string) => void;
}

export const MonitoringAtelierTab: React.FC<MonitoringAtelierTabProps> = ({
  dossiers = [],
  suivisOF = [],
  articles = [],
  onRefreshData,
  onNavigateToTab
}) => {
  const [recherche, setRecherche] = useState<string>('');
  const [filtreFamille, setFiltreFamille] = useState<string>('TOUTES');
  const [filtreSousType, setFiltreSousType] = useState<string>('TOUS');
  const [filtreRetard, setFiltreRetard] = useState<'TOUS' | 'RETARD_CRITIQUE' | 'TOUT_RETARD'>('TOUS');
  const [isParamsModalOpen, setIsParamsModalOpen] = useState<boolean>(false);
  const [isInjectingDemo, setIsInjectingDemo] = useState<boolean>(false);
  const [feedbackDemo, setFeedbackDemo] = useState<string | null>(null);

  // Calcul du monitoring en temps réel
  const monitoringData: DonneesMonitoringAtelier = useMemo(() => {
    return MonitoringService.calculerMonitoring(dossiers, suivisOF, articles);
  }, [dossiers, suivisOF, articles]);

  // Filtrage du tableau de commandes en cours
  const commandesFiltrees = useMemo(() => {
    return monitoringData.commandesActives.filter(cmd => {
      // Filtre respect des délais et retard atelier
      if (filtreRetard === 'RETARD_CRITIQUE' && !cmd.alerteDelai?.estRetardCritique) {
        return false;
      }
      if (filtreRetard === 'TOUT_RETARD' && !cmd.alerteDelai?.estDepasse) {
        return false;
      }

      // Filtre famille
      if (filtreFamille !== 'TOUTES' && cmd.famille !== filtreFamille) {
        return false;
      }
      // Filtre sous-type précis (ex: 25, 30, 40, 43, 55, Précadre 36/50, Moustiquaires)
      if (filtreSousType !== 'TOUS') {
        const cles: string[] = (cmd.sousTypesCles && cmd.sousTypesCles.length > 0)
          ? cmd.sousTypesCles
          : (cmd.sousTypeCle ? [cmd.sousTypeCle] : []);

        if (cles.length > 0) {
          if (!cles.includes(filtreSousType)) {
            return false;
          }
        } else {
          // Fallback uniquement sur typePrecision (JAMAIS sur detailArticles pour éviter les longueurs comme 1300mm, 2300mm)
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
          if (filtreSousType === 'MSTQ_DOUBLE_VANTAUX' && !(p.includes('DOUBLE') || p.includes('VENTO') || p.includes('VANTAUX') || p.includes('DV'))) return false;
          if (filtreSousType === 'MSTQ_FIXE' && !(p.includes('FIX') || p.includes('FIXE'))) return false;
        }
      }
      // Filtre recherche textuelle
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

  // Handler pour injecter les données de simulation
  const handleInjecterDemo = async () => {
    setIsInjectingDemo(true);
    try {
      const demo = MonitoringService.genererCommandesAtelierExemple();
      await StorageService.saveDossiers(demo.dossiers);
      await StorageService.saveSuivisOF(demo.suivisOF);
      onRefreshData();
      setFeedbackDemo('Carnet de commandes de simulation injecté avec succès dans SQLite !');
      setTimeout(() => setFeedbackDemo(null), 5000);
    } catch (e: any) {
      alert('Erreur lors de l\'injection de la démo: ' + e.message);
    } finally {
      setIsInjectingDemo(false);
    }
  };

  // Handler pour vider les commandes de test
  const handleViderDemo = async () => {
    if (confirm('Voulez-vous supprimer les dossiers et ordres de fabrication enregistrés ?')) {
      await StorageService.saveDossiers([]);
      await StorageService.saveSuivisOF([]);
      onRefreshData();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const { caissons, tabliers, precadres, moustiquaires } = monitoringData;

  return (
    <div className="space-y-6">
      {/* ── 1. BANDEAU DE MONITORING EN DIRECT ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-slate-50 tracking-tight">
                  Tableau de Bord de Monitoring Atelier
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  En direct de l'Atelier
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {monitoringData.dateHeureCalcul}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Suivi précis des volumes en fabrication : Caissons (25, 30, 40), Tabliers (43, 55), Précadres (Type 36, Type 50) et Moustiquaires (Porte-Fenêtre, Fenêtre, Double Vantaux, Fixe) avec échéancier prévisionnel de livraison.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsParamsModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-sky-300 bg-sky-950/50 hover:bg-sky-900/60 rounded-xl transition border border-sky-500/40 flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Ajuster les cadences par famille et les jours ouvrés"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              <span>Paramètres Cadences</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm print:hidden"
              title="Imprimer le rapport de monitoring A4 pour l'atelier"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Imprimer A4</span>
            </button>

            <button
              onClick={onRefreshData}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Actualiser</span>
            </button>
          </div>
        </div>

        {/* Message d'aide si base vide */}
        {monitoringData.totalCommandesActives === 0 && (
          <div className="mt-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 text-amber-200 text-xs">
            <div className="flex items-center gap-2.5">
              <Info className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-100">Aucune commande actuellement en cours dans l'atelier.</p>
                <p className="text-amber-300/80">
                  Vous pouvez enregistrer des commandes depuis l'onglet « Écosystème &amp; Commandes », ou injecter un jeu d'essai réaliste pour visualiser instantanément le monitoring.
                </p>
              </div>
            </div>
            <button
              disabled={isInjectingDemo}
              onClick={handleInjecterDemo}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition shadow flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isInjectingDemo ? 'Injection en cours...' : '🧪 Charger Commandes d\'Exemple Atelier'}</span>
            </button>
          </div>
        )}

        {feedbackDemo && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{feedbackDemo}</span>
          </div>
        )}
      </div>

      {/* ── BANNIÈRE D'ALERTE : COMMANDES EN DÉPASSEMENT > 3 JOURS (À VÉRIFIER EN ATELIER) ── */}
      {monitoringData.totalRetardCritiqueAVerifier > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-red-950/80 to-slate-900 border-2 border-rose-500 shadow-2xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black shadow-lg shadow-rose-600/50 shrink-0 ring-4 ring-rose-500/30">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-xs uppercase tracking-wider shadow">
                  🚩 Alerte Atelier : Délai non respecté
                </span>
                <span className="text-sm font-bold text-rose-200">
                  {monitoringData.totalRetardCritiqueAVerifier} commande{monitoringData.totalRetardCritiqueAVerifier > 1 ? 's dépassent' : ' dépasse'} leur délai de plus de 3 jours
                </span>
              </div>
              <p className="text-xs text-rose-200/90 mt-1">
                La date prévisionnelle calculée lors de la saisie est expirée depuis plus de 3 jours :
                <strong className="text-white ml-1 font-semibold underline decoration-rose-400">
                  cette commande doit être vérifiée dans l'atelier car son délai n'est pas respecté.
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFiltreRetard(filtreRetard === 'RETARD_CRITIQUE' ? 'TOUS' : 'RETARD_CRITIQUE')}
              className={`px-4 py-2 text-xs font-bold rounded-xl cursor-pointer transition shadow-lg flex items-center gap-2 ${
                filtreRetard === 'RETARD_CRITIQUE'
                  ? 'bg-white text-rose-950 ring-2 ring-rose-300 font-black'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              <Flag className="w-4 h-4 text-rose-300 fill-current" />
              <span>{filtreRetard === 'RETARD_CRITIQUE' ? 'Afficher Tout l\'Atelier' : 'Isoler les Commandes à Vérifier'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 2. KPIS GLOBAUX DE L'ATELIER (5 CARTES AVEC RESPECT DES DÉLAIS) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Commandes Actives */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Commandes en Cours</span>
            <Boxes className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-slate-50 font-mono mt-1">
            {monitoringData.totalCommandesActives}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">{caissons.nbCommandesEnCours}</span> Caissons •{' '}
            <span className="text-sky-400 font-bold">{tabliers.nbCommandesEnCours}</span> Tabliers
          </div>
        </div>

        {/* Total Pièces en Fabrication */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Pièces à Fabriquer</span>
            <Scissors className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono mt-1">
            {monitoringData.totalPiecesEnFabrication}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Toutes familles confondues sur postes
          </div>
        </div>

        {/* Charge Globale Heures */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Charge d'Atelier Estimée</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-black text-sky-400 font-mono mt-1">
            {monitoringData.chargeTotaleHeures} <span className="text-sm font-sans font-normal text-slate-400">heures</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Temps de sciage, usinage et assemblage
          </div>
        </div>

        {/* Échéance Atelier Globale (Jusqu'au) */}
        <div className="bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-500/40 rounded-xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-indigo-300 font-medium">
            <span>Échéance Atelier Globale</span>
            <Truck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-base font-bold text-indigo-200 font-mono mt-1 leading-tight">
            {monitoringData.totalPiecesEnFabrication > 0
              ? monitoringData.dateLivraisonGlobaleJusquAu
              : 'Capacité 100% disponible'}
          </div>
          <div className="text-[11px] text-indigo-400/80 mt-1">
            Date maximale d'absorption de la file
          </div>
        </div>

        {/* Respect des Délais & Alertes Atelier */}
        <div
          onClick={() => {
            if (monitoringData.totalRetardCritiqueAVerifier > 0) {
              setFiltreRetard(filtreRetard === 'RETARD_CRITIQUE' ? 'TOUS' : 'RETARD_CRITIQUE');
            }
          }}
          className={`rounded-xl p-4 shadow transition cursor-pointer border ${
            monitoringData.totalRetardCritiqueAVerifier > 0
              ? 'bg-rose-950/40 border-rose-500/80 hover:bg-rose-950/60 ring-1 ring-rose-500/50'
              : monitoringData.totalEnRetard > 0
              ? 'bg-amber-950/30 border-amber-500/50 hover:bg-amber-950/50'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className={monitoringData.totalRetardCritiqueAVerifier > 0 ? 'text-rose-300 font-bold' : 'text-slate-400'}>
              Respect Délais Atelier
            </span>
            <Flag className={`w-4 h-4 ${monitoringData.totalRetardCritiqueAVerifier > 0 ? 'text-rose-400 fill-current' : 'text-slate-500'}`} />
          </div>
          <div className="text-3xl font-black font-mono mt-1 flex items-baseline gap-2">
            <span className={monitoringData.totalRetardCritiqueAVerifier > 0 ? 'text-rose-400' : 'text-emerald-400'}>
              {monitoringData.totalRetardCritiqueAVerifier > 0 ? `${monitoringData.totalRetardCritiqueAVerifier}` : '100%'}
            </span>
            {monitoringData.totalRetardCritiqueAVerifier > 0 && (
              <span className="text-xs font-bold text-rose-300 uppercase">à vérifier (&gt;3j)</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {monitoringData.totalRetardCritiqueAVerifier > 0
              ? 'Cliquez pour isoler ces commandes'
              : monitoringData.totalEnRetard > 0
              ? `${monitoringData.totalEnRetard} en léger retard (≤3j)`
              : 'Aucun retard critique détecté'}
          </div>
        </div>
      </div>

      {/* ── 3. FOCUS MAJEUR : CAISSONS (30, 25, 40 & LIVRAISON JUSQU'AU) ── */}
      <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Entête Caissons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-amber-100">
                  Monitoring des Caissons &amp; Sous-Faces
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-950 border border-amber-800 text-amber-300">
                  {caissons.nbCommandesEnCours} Commande{caissons.nbCommandesEnCours > 1 ? 's' : ''}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-200">
                  {caissons.totalPiecesEnCours} Pièce{caissons.totalPiecesEnCours > 1 ? 's' : ''} au total
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ventilation détaillée par section de caisson tunnel et suivi de la file de fabrication.
              </p>
            </div>
          </div>

          {/* Badge Estimation Livraison Caissons Jusqu'au */}
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-xl px-4 py-2 flex items-center gap-3 shadow-inner">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                Livraison Prévisionnelle Caissons Jusqu'au :
              </div>
              <div className="text-sm font-black text-amber-100 font-mono">
                {caissons.totalPiecesEnCours > 0
                  ? caissons.dateLivraisonJusquAu
                  : 'Aucune commande en attente'}
              </div>
              <div className="text-[10px] text-amber-300/80">
                Cadence : {caissons.capaciteJournaliere} pcs/j • {caissons.chargeHeuresEstimee}h de charge ({caissons.joursOuvresRequis} jour{caissons.joursOuvresRequis > 1 ? 's' : ''} ouvré{caissons.joursOuvresRequis > 1 ? 's' : ''})
              </div>
            </div>
          </div>
        </div>

        {/* Grille des Tailles 30, 25, 40 et Autres */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Caisson 30 (300 mm) */}
          <div
            onClick={() => {
              setFiltreFamille('CAISSON');
              setFiltreSousType(filtreSousType === 'CAISSON_30' ? 'TOUS' : 'CAISSON_30');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'CAISSON_30'
                ? 'bg-amber-950/70 border-amber-400 shadow-lg ring-1 ring-amber-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-amber-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-300">Caisson 30 (300 mm)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {caissons.detailsCaissons?.c30.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {caissons.detailsCaissons?.c30.totalPieces || 0}
              </div>
              <span className="text-xs text-amber-400/90 font-semibold">
                {caissons.detailsCaissons?.c30.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${caissons.detailsCaissons?.c30.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              CT SOMO 30 BL / Arrondi / Fibraglo
            </div>
          </div>

          {/* Caisson 25 (250 mm) */}
          <div
            onClick={() => {
              setFiltreFamille('CAISSON');
              setFiltreSousType(filtreSousType === 'CAISSON_25' ? 'TOUS' : 'CAISSON_25');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'CAISSON_25'
                ? 'bg-amber-950/70 border-amber-400 shadow-lg ring-1 ring-amber-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-amber-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-300">Caisson 25 (250 mm)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {caissons.detailsCaissons?.c25.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {caissons.detailsCaissons?.c25.totalPieces || 0}
              </div>
              <span className="text-xs text-amber-400/90 font-semibold">
                {caissons.detailsCaissons?.c25.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${caissons.detailsCaissons?.c25.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              CT SOMO 25 Arrondi / Carré
            </div>
          </div>

          {/* Caisson 40 (400 mm) */}
          <div
            onClick={() => {
              setFiltreFamille('CAISSON');
              setFiltreSousType(filtreSousType === 'CAISSON_40' ? 'TOUS' : 'CAISSON_40');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'CAISSON_40'
                ? 'bg-amber-950/70 border-amber-400 shadow-lg ring-1 ring-amber-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-amber-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-300">Caisson 40 (400 mm)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {caissons.detailsCaissons?.c40.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {caissons.detailsCaissons?.c40.totalPieces || 0}
              </div>
              <span className="text-xs text-amber-400/90 font-semibold">
                {caissons.detailsCaissons?.c40.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-orange-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${caissons.detailsCaissons?.c40.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              CT SOMO 40*35 / Grand Gabarit
            </div>
          </div>

          {/* Sous-faces & Autres */}
          <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Sous-Faces &amp; Autres</span>
              <span className="text-[11px] font-mono text-slate-400">
                {caissons.detailsCaissons?.autres.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {caissons.detailsCaissons?.autres.totalPieces || 0}
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                {caissons.detailsCaissons?.autres.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-slate-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${caissons.detailsCaissons?.autres.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              SF 200, 250, 300 &amp; Joues
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. FOCUS : TABLIERS (43, 55 & ESTIMATION LIVRAISON) ── */}
      <div className="bg-slate-900 border-2 border-sky-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Entête Tabliers */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30 font-bold">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-sky-100">
                  Monitoring des Tabliers de Volets Roulants
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-950 border border-sky-800 text-sky-300">
                  {tabliers.nbCommandesEnCours} Commande{tabliers.nbCommandesEnCours > 1 ? 's' : ''}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-200">
                  {tabliers.totalPiecesEnCours} Pièce{tabliers.totalPiecesEnCours > 1 ? 's' : ''} au total
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ventilation par type de profilé de lame (Lame 43 mm, Lame 55 mm) et suivi des délais.
              </p>
            </div>
          </div>

          {/* Badge Estimation Livraison Tabliers Jusqu'au */}
          <div className="bg-gradient-to-r from-sky-500/20 to-blue-500/20 border border-sky-500/40 rounded-xl px-4 py-2 flex items-center gap-3 shadow-inner">
            <div className="w-8 h-8 rounded-lg bg-sky-500 text-slate-950 flex items-center justify-center font-black">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                Livraison Prévisionnelle Tabliers Jusqu'au :
              </div>
              <div className="text-sm font-black text-sky-100 font-mono">
                {tabliers.totalPiecesEnCours > 0
                  ? tabliers.dateLivraisonJusquAu
                  : 'Aucune commande en attente'}
              </div>
              <div className="text-[10px] text-sky-300/80">
                Cadence : {tabliers.capaciteJournaliere} pcs/j • {tabliers.chargeHeuresEstimee}h de charge ({tabliers.joursOuvresRequis} jour{tabliers.joursOuvresRequis > 1 ? 's' : ''} ouvré{tabliers.joursOuvresRequis > 1 ? 's' : ''})
              </div>
            </div>
          </div>
        </div>

        {/* Grille Lames 43 et 55 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Lame 43 mm */}
          <div
            onClick={() => {
              setFiltreFamille('TABLIER');
              setFiltreSousType(filtreSousType === 'TABLIER_43' ? 'TOUS' : 'TABLIER_43');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'TABLIER_43'
                ? 'bg-sky-950/70 border-sky-400 shadow-lg ring-1 ring-sky-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-sky-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-300">Lame 43 mm (ALU / PVC)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {tabliers.detailsTabliers?.l43.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {tabliers.detailsTabliers?.l43.totalPieces || 0}
              </div>
              <span className="text-xs text-sky-400/90 font-semibold">
                {tabliers.detailsTabliers?.l43.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-sky-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${tabliers.detailsTabliers?.l43.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              TAB 43 7024 / BL / 9007 / NR
            </div>
          </div>

          {/* Lame 55 mm */}
          <div
            onClick={() => {
              setFiltreFamille('TABLIER');
              setFiltreSousType(filtreSousType === 'TABLIER_55' ? 'TOUS' : 'TABLIER_55');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'TABLIER_55'
                ? 'bg-sky-950/70 border-sky-400 shadow-lg ring-1 ring-sky-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-sky-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-300">Lame 55 mm (ALU / PVC)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {tabliers.detailsTabliers?.l55.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {tabliers.detailsTabliers?.l55.totalPieces || 0}
              </div>
              <span className="text-xs text-sky-400/90 font-semibold">
                {tabliers.detailsTabliers?.l55.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${tabliers.detailsTabliers?.l55.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              TAB 55 7024 / BL / 9007 (Grandes Baies)
            </div>
          </div>

          {/* Autres Lames */}
          <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Autres Lames (39, 77...)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {tabliers.detailsTabliers?.autres.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {tabliers.detailsTabliers?.autres.totalPieces || 0}
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                {tabliers.detailsTabliers?.autres.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-slate-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${tabliers.detailsTabliers?.autres.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Lames spécifiques extrudées ou isolées
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. FOCUS : PRÉCADRES (TYPE 36 & TYPE 50) ── */}
      <div className="bg-slate-900 border-2 border-purple-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Entête Précadres */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30 font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-purple-100">
                  Monitoring des Précadres Aluminium
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-950 border border-purple-800 text-purple-300">
                  {precadres.nbCommandesEnCours} Commande{precadres.nbCommandesEnCours > 1 ? 's' : ''}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-200">
                  {precadres.totalPiecesEnCours} Pièce{precadres.totalPiecesEnCours > 1 ? 's' : ''} au total
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ventilation détaillée par type de profilé : Type 36 (36 mm standard) et Type 50 (50 mm renforcé/grand gabarit).
              </p>
            </div>
          </div>

          {/* Badge Estimation Livraison Précadres Jusqu'au */}
          <div className="bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/40 rounded-xl px-4 py-2 flex items-center gap-3 shadow-inner">
            <div className="w-8 h-8 rounded-lg bg-purple-500 text-slate-950 flex items-center justify-center font-black">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                Livraison Prévisionnelle Précadres Jusqu'au :
              </div>
              <div className="text-sm font-black text-purple-100 font-mono">
                {precadres.totalPiecesEnCours > 0
                  ? precadres.dateLivraisonJusquAu
                  : 'Aucune commande en attente'}
              </div>
              <div className="text-[10px] text-purple-300/80">
                Cadence : {precadres.capaciteJournaliere} pcs/j • {precadres.chargeHeuresEstimee}h de charge ({precadres.joursOuvresRequis} jour{precadres.joursOuvresRequis > 1 ? 's' : ''} ouvré{precadres.joursOuvresRequis > 1 ? 's' : ''})
              </div>
            </div>
          </div>
        </div>

        {/* Grille Type 36, Type 50 et Profils Spéciaux */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Précadre Type 36 */}
          <div
            onClick={() => {
              setFiltreFamille('PRECADRE');
              setFiltreSousType(filtreSousType === 'PRECADRE_36' ? 'TOUS' : 'PRECADRE_36');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'PRECADRE_36'
                ? 'bg-purple-950/70 border-purple-400 shadow-lg ring-1 ring-purple-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-purple-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-purple-300">Précadre Type 36 (36 mm Standard)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {precadres.detailsPrecadres?.p36.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {precadres.detailsPrecadres?.p36.totalPieces || 0}
              </div>
              <span className="text-xs text-purple-400/90 font-semibold">
                {precadres.detailsPrecadres?.p36.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-purple-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${precadres.detailsPrecadres?.p36.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Profilé 36mm • Fenêtres &amp; baies standard
            </div>
          </div>

          {/* Précadre Type 50 */}
          <div
            onClick={() => {
              setFiltreFamille('PRECADRE');
              setFiltreSousType(filtreSousType === 'PRECADRE_50' ? 'TOUS' : 'PRECADRE_50');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'PRECADRE_50'
                ? 'bg-purple-950/70 border-purple-400 shadow-lg ring-1 ring-purple-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-purple-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-purple-300">Précadre Type 50 (50 mm Renforcé)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {precadres.detailsPrecadres?.p50.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {precadres.detailsPrecadres?.p50.totalPieces || 0}
              </div>
              <span className="text-xs text-purple-400/90 font-semibold">
                {precadres.detailsPrecadres?.p50.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-indigo-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${precadres.detailsPrecadres?.p50.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Profilé 50mm • Portes-fenêtres &amp; haute inertie
            </div>
          </div>

          {/* Autres Précadres */}
          <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Autres Profilés Spéciaux</span>
              <span className="text-[11px] font-mono text-slate-400">
                {precadres.detailsPrecadres?.autres.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {precadres.detailsPrecadres?.autres.totalPieces || 0}
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                {precadres.detailsPrecadres?.autres.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-slate-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${precadres.detailsPrecadres?.autres.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Bouchons &amp; pièces sur-mesure
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. FOCUS : MOUSTIQUAIRES (PORTE-FENÊTRE, FENÊTRE, DOUBLE VANTAUX, FIXE) ── */}
      <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Entête Moustiquaires */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 font-bold">
              <Maximize2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-emerald-100">
                  Monitoring des Moustiquaires Plissées &amp; Cadres
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-950 border border-emerald-800 text-emerald-300">
                  {moustiquaires.nbCommandesEnCours} Commande{moustiquaires.nbCommandesEnCours > 1 ? 's' : ''}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-200">
                  {moustiquaires.totalPiecesEnCours} Pièce{moustiquaires.totalPiecesEnCours > 1 ? 's' : ''} au total
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ventilation détaillée par typologie : Porte-Fenêtre, Fenêtre (1 vantail), Double Vantaux (Double Vento) et Cadre Fixe.
              </p>
            </div>
          </div>

          {/* Badge Estimation Livraison Moustiquaires Jusqu'au */}
          <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 rounded-xl px-4 py-2 flex items-center gap-3 shadow-inner">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Livraison Prévisionnelle Moustiquaires Jusqu'au :
              </div>
              <div className="text-sm font-black text-emerald-100 font-mono">
                {moustiquaires.totalPiecesEnCours > 0
                  ? moustiquaires.dateLivraisonJusquAu
                  : 'Aucune commande en attente'}
              </div>
              <div className="text-[10px] text-emerald-300/80">
                Cadence : {moustiquaires.capaciteJournaliere} pcs/j • {moustiquaires.chargeHeuresEstimee}h de charge ({moustiquaires.joursOuvresRequis} jour{moustiquaires.joursOuvresRequis > 1 ? 's' : ''} ouvré{moustiquaires.joursOuvresRequis > 1 ? 's' : ''})
              </div>
            </div>
          </div>
        </div>

        {/* Grille 4 Types : Porte-Fenêtre, Fenêtre, Double Vantaux, Fixe */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Porte-Fenêtre */}
          <div
            onClick={() => {
              setFiltreFamille('MOUSTIQUAIRE');
              setFiltreSousType(filtreSousType === 'MSTQ_PORTE_FENETRE' ? 'TOUS' : 'MSTQ_PORTE_FENETRE');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'MSTQ_PORTE_FENETRE'
                ? 'bg-emerald-950/70 border-emerald-400 shadow-lg ring-1 ring-emerald-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300">Porte-Fenêtre</span>
              <span className="text-[11px] font-mono text-slate-400">
                {moustiquaires.detailsMoustiquaires?.porteFenetre.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {moustiquaires.detailsMoustiquaires?.porteFenetre.totalPieces || 0}
              </div>
              <span className="text-xs text-emerald-400/90 font-semibold">
                {moustiquaires.detailsMoustiquaires?.porteFenetre.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${moustiquaires.detailsMoustiquaires?.porteFenetre.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Passage grande hauteur • Seuil plat / chenille
            </div>
          </div>

          {/* Fenêtre (1 Vantail) */}
          <div
            onClick={() => {
              setFiltreFamille('MOUSTIQUAIRE');
              setFiltreSousType(filtreSousType === 'MSTQ_FENETRE' ? 'TOUS' : 'MSTQ_FENETRE');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'MSTQ_FENETRE'
                ? 'bg-emerald-950/70 border-emerald-400 shadow-lg ring-1 ring-emerald-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300">Fenêtre (1 Vantail)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {moustiquaires.detailsMoustiquaires?.fenetre.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {moustiquaires.detailsMoustiquaires?.fenetre.totalPieces || 0}
              </div>
              <span className="text-xs text-emerald-400/90 font-semibold">
                {moustiquaires.detailsMoustiquaires?.fenetre.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${moustiquaires.detailsMoustiquaires?.fenetre.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Coulissement latéral 1 vantail standard
            </div>
          </div>

          {/* Double Vantaux */}
          <div
            onClick={() => {
              setFiltreFamille('MOUSTIQUAIRE');
              setFiltreSousType(filtreSousType === 'MSTQ_DOUBLE_VANTAUX' ? 'TOUS' : 'MSTQ_DOUBLE_VANTAUX');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'MSTQ_DOUBLE_VANTAUX'
                ? 'bg-emerald-950/70 border-emerald-400 shadow-lg ring-1 ring-emerald-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300">Double Vantaux (Double Vento)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {moustiquaires.detailsMoustiquaires?.doubleVantaux.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {moustiquaires.detailsMoustiquaires?.doubleVantaux.totalPieces || 0}
              </div>
              <span className="text-xs text-emerald-400/90 font-semibold">
                {moustiquaires.detailsMoustiquaires?.doubleVantaux.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${moustiquaires.detailsMoustiquaires?.doubleVantaux.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Fermeture centrale magnétique 2 vantaux
            </div>
          </div>

          {/* Cadre Fixe */}
          <div
            onClick={() => {
              setFiltreFamille('MOUSTIQUAIRE');
              setFiltreSousType(filtreSousType === 'MSTQ_FIXE' ? 'TOUS' : 'MSTQ_FIXE');
            }}
            className={`p-4 rounded-xl border transition cursor-pointer select-none ${
              filtreSousType === 'MSTQ_FIXE'
                ? 'bg-emerald-950/70 border-emerald-400 shadow-lg ring-1 ring-emerald-400'
                : 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300">Cadre Fixe (Fix)</span>
              <span className="text-[11px] font-mono text-slate-400">
                {moustiquaires.detailsMoustiquaires?.fixe.nbCommandes || 0} cmd(s)
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-slate-50">
                {moustiquaires.detailsMoustiquaires?.fixe.totalPieces || 0}
              </div>
              <span className="text-xs text-emerald-400/90 font-semibold">
                {moustiquaires.detailsMoustiquaires?.fixe.pourcentage || 0}% du total
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${moustiquaires.detailsMoustiquaires?.fixe.pourcentage || 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Cadre fixe clipsable ou vissé
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. VUE DIRECTE : CE QUI SE FAIT RÉELLEMENT DANS L'ATELIER (TABLEAU) ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Vue Directe de l'Atelier — Commandes &amp; Lignes en Cours</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300">
                {commandesFiltrees.length} affichée(s)
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Liste complète de chaque commande en fabrication avec son statut machine et son échéance de livraison calculée.
            </p>
          </div>

          {/* Filtres Rapides */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                setFiltreFamille('TOUTES');
                setFiltreSousType('TOUS');
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreFamille === 'TOUTES' && filtreSousType === 'TOUS'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Tous
            </button>

            <button
              onClick={() => {
                setFiltreFamille('CAISSON');
                setFiltreSousType('TOUS');
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreFamille === 'CAISSON' && filtreSousType === 'TOUS'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
              }`}
            >
              🗄️ Caissons ({caissons.nbCommandesEnCours})
            </button>

            <button
              onClick={() => {
                setFiltreFamille('CAISSON');
                setFiltreSousType(filtreSousType === 'CAISSON_30' ? 'TOUS' : 'CAISSON_30');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'CAISSON_30'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-amber-300 hover:bg-slate-700'
              }`}
            >
              Caisson 30
            </button>

            <button
              onClick={() => {
                setFiltreFamille('CAISSON');
                setFiltreSousType(filtreSousType === 'CAISSON_25' ? 'TOUS' : 'CAISSON_25');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'CAISSON_25'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-amber-300 hover:bg-slate-700'
              }`}
            >
              Caisson 25
            </button>

            <button
              onClick={() => {
                setFiltreFamille('CAISSON');
                setFiltreSousType(filtreSousType === 'CAISSON_40' ? 'TOUS' : 'CAISSON_40');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'CAISSON_40'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-amber-300 hover:bg-slate-700'
              }`}
            >
              Caisson 40
            </button>

            <button
              onClick={() => {
                setFiltreFamille('TABLIER');
                setFiltreSousType('TOUS');
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreFamille === 'TABLIER' && filtreSousType === 'TOUS'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-sky-400 hover:bg-slate-700'
              }`}
            >
              🪟 Tabliers ({tabliers.nbCommandesEnCours})
            </button>

            <button
              onClick={() => {
                setFiltreFamille('TABLIER');
                setFiltreSousType(filtreSousType === 'TABLIER_43' ? 'TOUS' : 'TABLIER_43');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'TABLIER_43'
                  ? 'bg-sky-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-sky-300 hover:bg-slate-700'
              }`}
            >
              Lame 43
            </button>

            <button
              onClick={() => {
                setFiltreFamille('TABLIER');
                setFiltreSousType(filtreSousType === 'TABLIER_55' ? 'TOUS' : 'TABLIER_55');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'TABLIER_55'
                  ? 'bg-sky-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-sky-300 hover:bg-slate-700'
              }`}
            >
              Lame 55
            </button>

            {/* Filtres Précadres 36 & 50 */}
            <button
              onClick={() => {
                setFiltreFamille('PRECADRE');
                setFiltreSousType('TOUS');
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreFamille === 'PRECADRE' && filtreSousType === 'TOUS'
                  ? 'bg-purple-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-purple-400 hover:bg-slate-700'
              }`}
            >
              🚪 Précadres ({precadres.nbCommandesEnCours})
            </button>

            <button
              onClick={() => {
                setFiltreFamille('PRECADRE');
                setFiltreSousType(filtreSousType === 'PRECADRE_36' ? 'TOUS' : 'PRECADRE_36');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'PRECADRE_36'
                  ? 'bg-purple-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-purple-300 hover:bg-slate-700'
              }`}
            >
              Précadre 36
            </button>

            <button
              onClick={() => {
                setFiltreFamille('PRECADRE');
                setFiltreSousType(filtreSousType === 'PRECADRE_50' ? 'TOUS' : 'PRECADRE_50');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'PRECADRE_50'
                  ? 'bg-purple-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-purple-300 hover:bg-slate-700'
              }`}
            >
              Précadre 50
            </button>

            {/* Filtres Moustiquaires : PF, Fenêtre, Double Vantaux, Fixe */}
            <button
              onClick={() => {
                setFiltreFamille('MOUSTIQUAIRE');
                setFiltreSousType('TOUS');
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreFamille === 'MOUSTIQUAIRE' && filtreSousType === 'TOUS'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
              }`}
            >
              🦟 Moustiquaires ({moustiquaires.nbCommandesEnCours})
            </button>

            <button
              onClick={() => {
                setFiltreFamille('MOUSTIQUAIRE');
                setFiltreSousType(filtreSousType === 'MSTQ_PORTE_FENETRE' ? 'TOUS' : 'MSTQ_PORTE_FENETRE');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'MSTQ_PORTE_FENETRE'
                  ? 'bg-emerald-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-emerald-300 hover:bg-slate-700'
              }`}
            >
              Porte-Fenêtre
            </button>

            <button
              onClick={() => {
                setFiltreFamille('MOUSTIQUAIRE');
                setFiltreSousType(filtreSousType === 'MSTQ_FENETRE' ? 'TOUS' : 'MSTQ_FENETRE');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'MSTQ_FENETRE'
                  ? 'bg-emerald-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-emerald-300 hover:bg-slate-700'
              }`}
            >
              Fenêtre
            </button>

            <button
              onClick={() => {
                setFiltreFamille('MOUSTIQUAIRE');
                setFiltreSousType(filtreSousType === 'MSTQ_DOUBLE_VANTAUX' ? 'TOUS' : 'MSTQ_DOUBLE_VANTAUX');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'MSTQ_DOUBLE_VANTAUX'
                  ? 'bg-emerald-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-emerald-300 hover:bg-slate-700'
              }`}
            >
              Double Vantaux
            </button>

            <button
              onClick={() => {
                setFiltreFamille('MOUSTIQUAIRE');
                setFiltreSousType(filtreSousType === 'MSTQ_FIXE' ? 'TOUS' : 'MSTQ_FIXE');
              }}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                filtreSousType === 'MSTQ_FIXE'
                  ? 'bg-emerald-400 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-emerald-300 hover:bg-slate-700'
              }`}
            >
              Cadre Fixe
            </button>

            {/* Filtres de Retards & Alertes Délais */}
            {monitoringData.totalRetardCritiqueAVerifier > 0 && (
              <button
                onClick={() => {
                  setFiltreRetard(filtreRetard === 'RETARD_CRITIQUE' ? 'TOUS' : 'RETARD_CRITIQUE');
                }}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  filtreRetard === 'RETARD_CRITIQUE'
                    ? 'bg-rose-600 text-white ring-2 ring-rose-400 shadow-md animate-pulse'
                    : 'bg-rose-950/80 text-rose-300 border border-rose-700/60 hover:bg-rose-900/60'
                }`}
                title="Commandes dépassant leur délai de plus de 3 jours à vérifier en atelier"
              >
                <Flag className="w-3 h-3 text-rose-400 fill-current" />
                <span>🚨 À Vérifier Atelier ({monitoringData.totalRetardCritiqueAVerifier})</span>
              </button>
            )}

            {monitoringData.totalEnRetard > 0 && (
              <button
                onClick={() => {
                  setFiltreRetard(filtreRetard === 'TOUT_RETARD' ? 'TOUS' : 'TOUT_RETARD');
                }}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  filtreRetard === 'TOUT_RETARD'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/50'
                }`}
                title="Toutes les commandes ayant dépassé leur date prévisionnelle de livraison"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>Tous Retards ({monitoringData.totalEnRetard})</span>
              </button>
            )}
          </div>
        </div>

        {/* Barre de Recherche */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher par N° Commande, Client, Donneur d'ordre, Article, Section..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Table interactive */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5">Réf. Commande</th>
                <th className="py-3 px-3.5">Client &amp; Donneur d'ordre</th>
                <th className="py-3 px-3.5">Famille &amp; Section</th>
                <th className="py-3 px-3.5">Détail Fabrication</th>
                <th className="py-3 px-3.5 text-center">Quantité</th>
                <th className="py-3 px-3.5">Statut Atelier</th>
                <th className="py-3 px-3.5">Livraison Prévisionnelle</th>
                <th className="py-3 px-3.5">Respect des Délais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {commandesFiltrees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500 text-xs">
                    Aucune commande trouvée avec les filtres sélectionnés.
                  </td>
                </tr>
              ) : (
                commandesFiltrees.map((cmd, idx) => {
                  const isCaisson = cmd.famille === 'CAISSON';
                  const isTablier = cmd.famille === 'TABLIER';
                  const isPrecadre = cmd.famille === 'PRECADRE';
                  const isMoustiquaire = cmd.famille === 'MOUSTIQUAIRE';
                  const estCritique = cmd.alerteDelai?.estRetardCritique;
                  const estEnRetard = cmd.alerteDelai?.estDepasse;

                  return (
                    <tr
                      key={cmd.id || idx}
                      className={`transition duration-150 ${
                        estCritique
                          ? 'bg-rose-950/30 border-l-4 border-l-rose-500 hover:bg-rose-950/50'
                          : estEnRetard
                          ? 'bg-amber-950/20 border-l-4 border-l-amber-500 hover:bg-amber-950/40'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Réf Commande */}
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{cmd.refCommande || 'SANS_REF'}</span>
                          {cmd.ofCode && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                              {cmd.ofCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-normal text-slate-500">
                          Saisie : {cmd.dateCommande}
                        </div>
                        {estCritique && (
                          <div className="text-[10px] font-bold text-rose-400 mt-1 flex items-center gap-1 animate-pulse">
                            <Flag className="w-3 h-3 text-rose-400 fill-current" />
                            <span>À VÉRIFIER EN ATELIER</span>
                          </div>
                        )}
                      </td>

                      {/* Client */}
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-200">
                          {cmd.client}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Donneur : {cmd.donneurOrdre}
                        </div>
                      </td>

                      {/* Famille & Section */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            isCaisson
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : isTablier
                              ? 'bg-sky-950 text-sky-300 border border-sky-800'
                              : isPrecadre
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : isMoustiquaire
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {isCaisson ? '🗄️ ' : isTablier ? '🪟 ' : isPrecadre ? '🚪 ' : isMoustiquaire ? '🦟 ' : '📦 '}
                          {cmd.typePrecision}
                        </span>
                      </td>

                      {/* Détail Fabrication */}
                      <td className="py-3 px-3.5 text-slate-300 max-w-xs truncate" title={cmd.detailArticles}>
                        {cmd.detailArticles}
                      </td>

                      {/* Quantité */}
                      <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-100">
                        <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-100">
                          {cmd.quantiteTotalPieces} pcs
                        </span>
                      </td>

                      {/* Statut Atelier */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            cmd.statutAtelier === 'OF_EMIS'
                              ? 'bg-blue-950 text-blue-300 border border-blue-700 animate-pulse'
                              : cmd.statutAtelier === 'RETOUR_SAISI'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {cmd.statutBadgeLabel}
                        </span>
                      </td>

                      {/* Livraison Prévisionnelle (calculée à la saisie) */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-xs text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{cmd.dateLivraisonPrevisionnelle}</span>
                        </div>
                      </td>

                      {/* Respect des Délais & Flague Couleur Atelier */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {cmd.alerteDelai ? (
                          <div className="flex flex-col gap-1">
                            {estCritique ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-600 text-white border border-rose-400 shadow-md shadow-rose-950/80 animate-pulse">
                                  <Flag className="w-3.5 h-3.5 text-white fill-current shrink-0" />
                                  <span>À VÉRIFIER EN ATELIER</span>
                                  <span className="font-mono text-xs">+{cmd.alerteDelai.joursDeRetard}j</span>
                                </span>
                                <div className="text-[10px] text-rose-300 font-semibold">
                                  Délai dépassé &gt; 3 jours !
                                </div>
                              </div>
                            ) : estEnRetard ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>Retard (+{cmd.alerteDelai.joursDeRetard}j)</span>
                                </span>
                                <div className="text-[9px] text-amber-400/80">
                                  À surveiller
                                </div>
                              </div>
                            ) : cmd.alerteDelai.statutDelai === 'ECHEANCE_AUJOURDHUI' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-yellow-950 text-yellow-300 border border-yellow-700">
                                <span>⚡ Échéance aujourd'hui</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span>Dans les délais ({Math.abs(cmd.alerteDelai.joursDeRetard)}j)</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Paramètres Délais & Cadences */}
      <ParametresProductionModal
        isOpen={isParamsModalOpen}
        onClose={() => setIsParamsModalOpen(false)}
        onSaved={onRefreshData}
      />
    </div>
  );
};
