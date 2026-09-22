import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  ClipboardList,
  Scale,
  Sparkles,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  RefreshCw,
  Clock,
  ChevronRight,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { Article, ChuteItem, DossierCommandeGlobal, SuiviOF } from '../../types';
import { ConcordanceOFService, BilanCockpitOF } from '../../services/concordanceOFService';
import { SimulationClotureTester, ResultatSimulation } from '../../services/simulationClotureTester';
import { StorageService } from '../../services/storage';
import { CockpitEclairView } from './cloture/CockpitEclairView';
import { ClotureClassiqueView } from './cloture/ClotureClassiqueView';

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
  // Mode de clôture : Cockpit Éclair (Nouveau - Synthèse par Profilé & 1-Clic) vs Mode Classique (Ligne par Ligne)
  const [clotureMode, setClotureMode] = useState<'COCKPIT' | 'CLASSIQUE'>(() => {
    return (localStorage.getItem('3m_cockpit_mode') as 'COCKPIT' | 'CLASSIQUE') || 'COCKPIT';
  });

  // Sous-onglet principal : Exploitation (clôture courante) vs Simulateur de Fiabilité 100%
  const [subTab, setSubTab] = useState<'EXPLOITATION' | 'SIMULATEUR'>('EXPLOITATION');

  // OFs en attente de clôture
  const ofsActifs = useMemo(() => {
    return suivisOF.filter(o => o.statut === 'EMIS' || o.statut === 'RETOUR_EN_ATTENTE');
  }, [suivisOF]);

  const [selectedOFId, setSelectedOFId] = useState<string>(() => {
    const saved = localStorage.getItem('3m_cockpit_selected_of');
    if (saved && ofsActifs.some(o => o.id === saved)) return saved;
    return ofsActifs[0]?.id || '';
  });

  const [ofSearchQuery, setOfSearchQuery] = useState('');

  // Synchroniser la sélection et le mode si la liste change ou navigation externe
  useEffect(() => {
    const savedMode = localStorage.getItem('3m_cockpit_mode') as 'COCKPIT' | 'CLASSIQUE';
    if (savedMode && (savedMode === 'COCKPIT' || savedMode === 'CLASSIQUE')) {
      setClotureMode(savedMode);
    }
    const savedOf = localStorage.getItem('3m_cockpit_selected_of');
    if (savedOf && ofsActifs.some(o => o.id === savedOf)) {
      setSelectedOFId(savedOf);
    } else if (selectedOFId && !ofsActifs.some(o => o.id === selectedOFId)) {
      // L'OF sélectionné n'est plus actif (il a été clôturé !) -> on le ferme !
      localStorage.removeItem('3m_cockpit_selected_of');
      setSelectedOFId(ofsActifs[0]?.id || '');
    } else if (!selectedOFId && ofsActifs.length > 0) {
      setSelectedOFId(ofsActifs[0].id);
    }
  }, [suivisOF, ofsActifs, selectedOFId]);

  // Fonction explicite de fermeture d'OF (vider le cockpit ou passer au suivant)
  const handleCloseOF = (ofIdToClose?: string) => {
    const targetId = ofIdToClose || selectedOFId;
    localStorage.removeItem('3m_cockpit_selected_of');
    const remaining = ofsActifs.filter(o => o.id !== targetId);
    if (remaining.length > 0) {
      setSelectedOFId(remaining[0].id);
      localStorage.setItem('3m_cockpit_selected_of', remaining[0].id);
    } else {
      setSelectedOFId('');
    }
  };

  // Clôture validée : fermer immédiatement la fenêtre de clôture et retourner au tableau pour autre action
  const handleClotureSuccess = (closedOFId?: string) => {
    localStorage.removeItem('3m_cockpit_selected_of');
    onRefreshData();
    if (onNavigateToTab) {
      onNavigateToTab('encours');
    } else {
      handleCloseOF(closedOFId);
    }
  };

  const currentOF = useMemo(() => {
    return suivisOF.find(o => o.id === selectedOFId);
  }, [suivisOF, selectedOFId]);

  // Bilan Multi-profilés pour le Cockpit Éclair
  const [bilanCockpit, setBilanCockpit] = useState<BilanCockpitOF | null>(null);

  useEffect(() => {
    if (currentOF) {
      const b = ConcordanceOFService.preparerBilanCockpitMultiProfils(currentOF, articles, mapping);
      setBilanCockpit(b);
    } else {
      setBilanCockpit(null);
    }
  }, [currentOF, articles, mapping]);

  // Simulations automatiques de fiabilité
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

  // Liste des OFs filtrée pour le panneau de gauche
  const ofsFiltres = useMemo(() => {
    if (!ofSearchQuery.trim()) return ofsActifs;
    const q = ofSearchQuery.toLowerCase().trim();
    return ofsActifs.filter(o => {
      const code = (o.codeOF || '').toLowerCase();
      const num = (o.numCommande || '').toLowerCase();
      const cl = (o.nomClient || '').toLowerCase();
      const sec = (o.titreSection || '').toLowerCase();
      return code.includes(q) || num.includes(q) || cl.includes(q) || sec.includes(q);
    });
  }, [ofsActifs, ofSearchQuery]);

  const changerMode = (mode: 'COCKPIT' | 'CLASSIQUE') => {
    setClotureMode(mode);
    localStorage.setItem('3m_cockpit_mode', mode);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── Entête Supérieur avec Switcher de Mode ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('encours')}
              className="px-3.5 py-2 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm group"
              title="Revenir à la liste des Ordres en Cours"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-amber-400" />
              <span>← Ordres en Cours</span>
            </button>
          )}

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
                <span>Cockpit Clôture &amp; Bilan Matière</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  Stock 100% Fiable
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Validez le réel constaté sur le terrain par l'opérateur avec traçabilité intégrale des barres et chutes.
              </p>
            </div>
          </div>
        </div>

        {/* ── Sélecteur de Méthode de Clôture (Cockpit Éclair vs Classique) ── */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => changerMode('COCKPIT')}
            className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-2 transition cursor-pointer ${
              clotureMode === 'COCKPIT'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>⚡ Mode Cockpit Éclair (Votre Méthode)</span>
          </button>

          <button
            type="button"
            onClick={() => changerMode('CLASSIQUE')}
            className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-2 transition cursor-pointer ${
              clotureMode === 'CLASSIQUE'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>📋 Mode Classique (Détaillé)</span>
          </button>

          <div className="w-px h-6 bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => setSubTab(subTab === 'EXPLOITATION' ? 'SIMULATEUR' : 'EXPLOITATION')}
            className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'SIMULATEUR'
                ? 'bg-sky-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Lancer les simulations automatiques de tests unitaires"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Tests (100%)</span>
          </button>
        </div>
      </div>

      {/* ── Vue Simulateur (si activé) ── */}
      {subTab === 'SIMULATEUR' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Simulateur &amp; Banc de Tests Automatiques</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Vérification algorithmique de 10 cas de figure réels d'atelier (casse, chute non trouvée, chute hors-stock, etc.).
              </p>
            </div>
            <button
              type="button"
              disabled={isSimulating}
              onClick={lancerSimulations}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>Relancer les tests</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {simulations.map((sim, idx) => (
              <div
                key={sim.nomScenario || idx}
                className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-200">{sim.nomScenario}</span>
                    {sim.succes ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> SUCCÈS 100%
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> ÉCHEC
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{sim.description}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-sky-400 flex items-center justify-between">
                  <span>Impact barres : {sim.details?.stockBarresNeuvesImpact}</span>
                  <span>Chutes stockées : +{sim.details?.chutesStockeesCount}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setSubTab('EXPLOITATION')}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
            >
              ← Revenir à l'exploitation des OFs en attente
            </button>
          </div>
        </div>
      ) : (
        /* ── Vue Exploitation (Gauche : Liste OFs / Droite : Espace de Clôture) ── */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Panneau de gauche : Liste des OFs en attente de clôture */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col h-fit max-h-[85vh]">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>OFs à Clôturer ({ofsActifs.length})</span>
              </span>
              <button
                onClick={onRefreshData}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                title="Actualiser les données"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Recherche */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrer OF, client, réf..."
                value={ofSearchQuery}
                onChange={e => setOfSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Liste */}
            {ofsFiltres.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Aucun OF en attente de clôture
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1">
                {ofsFiltres.map(of => {
                  const isSelected = of.id === selectedOFId;

                  return (
                    <button
                      key={of.id}
                      type="button"
                      onClick={() => {
                        setSelectedOFId(of.id);
                        localStorage.setItem('3m_cockpit_selected_of', of.id);
                      }}
                      className={`w-full p-3 rounded-2xl text-left transition flex items-center justify-between gap-2 border cursor-pointer ${
                        isSelected
                          ? clotureMode === 'COCKPIT'
                            ? 'bg-emerald-950/40 border-emerald-500/70 shadow-md shadow-emerald-950/50'
                            : 'bg-amber-950/40 border-amber-500/70 shadow-md shadow-amber-950/50'
                          : 'bg-slate-950/60 hover:bg-slate-800/40 border-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded-md ${
                            isSelected
                              ? clotureMode === 'COCKPIT'
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            {of.codeOF || (of.numeroEmission ? `OF-${String(of.numeroEmission).padStart(3, '0')}` : 'OF')}
                          </span>
                          <span className="text-xs font-bold text-slate-200 truncate">
                            {of.numCommande}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-1">
                          Client : <strong className="text-slate-300">{of.nomClient}</strong>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          {of.titreSection}
                        </div>
                      </div>

                      <ChevronRight className={`w-4 h-4 shrink-0 transition ${
                        isSelected
                          ? clotureMode === 'COCKPIT' ? 'text-emerald-400 translate-x-0.5' : 'text-amber-400 translate-x-0.5'
                          : 'text-slate-600'
                      }`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panneau de droite : Espace de travail de Clôture */}
          <div className="lg:col-span-3 space-y-4">
            {/* Avertissement statut : un ordre doit être reçu pour être clôturé */}
            {currentOF && currentOF.statut === 'EMIS' && (
              <div className="bg-amber-950/60 border border-amber-600/70 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-200">
                      Ordre de Fabrication en statut ÉMIS (en cours à l'atelier)
                    </h4>
                    <p className="text-[11px] text-amber-300/80 mt-0.5">
                      Un ordre doit impérativement être marqué comme <strong>REÇU</strong> de l'atelier pour pouvoir être clôturé.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const updated: SuiviOF = { ...currentOF, statut: 'RETOUR_EN_ATTENTE' };
                    await StorageService.upsertSuiviOF(updated);
                    onRefreshData();
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Marquer comme Reçu maintenant</span>
                </button>
              </div>
            )}

            {!currentOF ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500">
                <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold text-slate-400">Aucun Ordre de Fabrication sélectionné</p>
                <p className="text-xs text-slate-600 mt-1">
                  Veuillez choisir un OF dans la liste de gauche pour procéder à sa clôture.
                </p>
              </div>
            ) : clotureMode === 'COCKPIT' ? (
              /* Mode Cockpit Éclair (Votre Méthode) */
              bilanCockpit ? (
                <CockpitEclairView
                  suivi={currentOF}
                  bilan={bilanCockpit}
                  articles={articles}
                  chutesBarres={chutesBarres}
                  mapping={mapping}
                  onBilanChange={setBilanCockpit}
                  onRefreshData={onRefreshData}
                  onClotureSuccess={() => handleClotureSuccess(currentOF.id)}
                  onCloseOF={() => handleClotureSuccess(currentOF.id)}
                  onNavigateToTab={onNavigateToTab}
                />
              ) : (
                <div className="p-8 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                  <span>Préparation du bilan multi-profilés...</span>
                </div>
              )
            ) : (
              /* Mode Classique (Détaillé Ligne par Ligne) */
              <ClotureClassiqueView
                key={currentOF.id}
                suivi={currentOF}
                articles={articles}
                chutesBarres={chutesBarres}
                mapping={mapping}
                onRefreshData={onRefreshData}
                onClotureSuccess={() => handleClotureSuccess(currentOF.id)}
                onCloseOF={() => handleClotureSuccess(currentOF.id)}
                onNavigateToTab={onNavigateToTab}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
