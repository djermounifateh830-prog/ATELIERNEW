import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Settings,
  Calendar,
  Clock,
  Check,
  Save,
  RotateCcw,
  Sparkles,
  Layers,
  Sliders,
  Scissors,
  Boxes,
  HelpCircle,
  AlertCircle,
  Truck,
  MapPin,
  Zap
} from 'lucide-react';
import {
  ParametresProductionAtelier,
  FamilleProduit,
  RegleTourneeDestination
} from '../../types';
import {
  DelaisProductionService,
  PARAMETRES_PRODUCTION_DEFAUT,
  TOURNEES_DESTINATIONS_DEFAUT,
  NOMS_JOURS_SEMAINE
} from '../../services/delaisProductionService';

interface ParametresProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ParametresProductionModal: React.FC<ParametresProductionModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const [params, setParams] = useState<ParametresProductionAtelier>(() =>
    DelaisProductionService.getParametres()
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      DelaisProductionService.loadParametresFromDb().then(p => {
        setParams(p);
      });
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleJourOuvre = (jourIndex: number) => {
    setParams(prev => {
      const exists = prev.joursOuvres.includes(jourIndex);
      let updated: number[];
      if (exists) {
        if (prev.joursOuvres.length <= 1) {
          alert("L'atelier doit comporter au moins un jour ouvré.");
          return prev;
        }
        updated = prev.joursOuvres.filter(j => j !== jourIndex);
      } else {
        updated = [...prev.joursOuvres, jourIndex].sort((a, b) => a - b);
      }
      return { ...prev, joursOuvres: updated };
    });
  };

  const applyPreset = (preset: 'DIM_JEU' | 'LUN_VEN' | 'SAM_JEU') => {
    if (preset === 'DIM_JEU') {
      setParams(prev => ({ ...prev, joursOuvres: [0, 1, 2, 3, 4] }));
    } else if (preset === 'LUN_VEN') {
      setParams(prev => ({ ...prev, joursOuvres: [1, 2, 3, 4, 5] }));
    } else if (preset === 'SAM_JEU') {
      setParams(prev => ({ ...prev, joursOuvres: [6, 0, 1, 2, 3, 4] }));
    }
  };

  const updateFamille = (
    fam: FamilleProduit,
    field: 'tempsUnitaireMinutes' | 'capaciteJournalierePieces' | 'delaiFixeJours',
    value: number
  ) => {
    setParams(prev => {
      const current = prev.familles[fam] || PARAMETRES_PRODUCTION_DEFAUT.familles[fam];
      const updatedFam = {
        ...current,
        [field]: Math.max(0, value)
      };

      // Si l'utilisateur ajuste le temps unitaire, recalculer une capacité journalière indicative basée sur les heures de travail
      if (field === 'tempsUnitaireMinutes' && value > 0) {
        const totalMinutesJour = (prev.heuresTravailParJour || 8) * 60;
        updatedFam.capaciteJournalierePieces = Math.max(1, Math.round(totalMinutesJour / value));
      } else if (field === 'capaciteJournalierePieces' && value > 0) {
        const totalMinutesJour = (prev.heuresTravailParJour || 8) * 60;
        updatedFam.tempsUnitaireMinutes = Math.max(1, Math.round(totalMinutesJour / value));
      }

      return {
        ...prev,
        familles: {
          ...prev.familles,
          [fam]: updatedFam
        }
      };
    });
  };

  const toggleJourTournee = (tourneeId: string, jourIndex: number) => {
    setParams(prev => {
      const tournees = prev.tourneesDestinations || TOURNEES_DESTINATIONS_DEFAUT;
      const updated = tournees.map(t => {
        if (t.id !== tourneeId) return t;
        const exists = t.joursLivraison.includes(jourIndex);
        const newJours = exists
          ? t.joursLivraison.filter(j => j !== jourIndex)
          : [...t.joursLivraison, jourIndex].sort((a, b) => a - b);
        return { ...t, joursLivraison: newJours.length > 0 ? newJours : [jourIndex] };
      });
      return { ...prev, tourneesDestinations: updated };
    });
  };

  const updateTourneeMaxPieces = (tourneeId: string, maxPcs: number) => {
    setParams(prev => {
      const tournees = prev.tourneesDestinations || TOURNEES_DESTINATIONS_DEFAUT;
      const updated = tournees.map(t => {
        if (t.id !== tourneeId) return t;
        return { ...t, maxPiecesExpress: Math.max(1, maxPcs) };
      });
      return { ...prev, tourneesDestinations: updated };
    });
  };

  const toggleTourneeExpress = (tourneeId: string) => {
    setParams(prev => {
      const tournees = prev.tourneesDestinations || TOURNEES_DESTINATIONS_DEFAUT;
      const updated = tournees.map(t => {
        if (t.id !== tourneeId) return t;
        return { ...t, delaiExpressPetitesCommandes: !t.delaiExpressPetitesCommandes };
      });
      return { ...prev, tourneesDestinations: updated };
    });
  };

  const handleReset = () => {
    if (confirm("Réinitialiser tous les paramètres de production aux valeurs d'usine ?")) {
      setParams({ ...PARAMETRES_PRODUCTION_DEFAUT });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await DelaisProductionService.saveParametres(params);
      setSavedSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (e: any) {
      alert('Erreur lors de la sauvegarde : ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getFamilleIcon = (fam: FamilleProduit) => {
    switch (fam) {
      case 'CAISSON':
        return <Layers className="w-5 h-5 text-amber-400" />;
      case 'PRECADRE':
        return <Boxes className="w-5 h-5 text-purple-400" />;
      case 'MOUSTIQUAIRE':
        return <Sliders className="w-5 h-5 text-emerald-400" />;
      case 'TABLIER':
        return <Scissors className="w-5 h-5 text-sky-400" />;
      default:
        return <Settings className="w-5 h-5 text-slate-400" />;
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Paramètres de Production &amp; Délais Prévisionnels</span>
                <span className="text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/40">
                  Cadences par Famille
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Configurez les jours de travail de l'atelier et la cadence unitaire moyenne pour chaque famille de produit.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps du modal avec défilement */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECTION 1 : JOURS OUVRÉS DE LA SEMAINE */}
          <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-400" />
                  <span>Jours de Travail de l'Atelier (Jours Ouvrés)</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cochez les jours où les machines et équipes tournent. Les délais sauteront automatiquement les jours désactivés.
                </p>
              </div>

              {/* Raccourcis / Presets */}
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="text-slate-500 mr-1 text-[11px]">Préréglages :</span>
                <button
                  type="button"
                  onClick={() => applyPreset('DIM_JEU')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition border border-slate-700"
                >
                  Dimanche → Jeudi
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('SAM_JEU')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition border border-slate-700"
                >
                  Samedi → Jeudi
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('LUN_VEN')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition border border-slate-700"
                >
                  Lundi → Vendredi
                </button>
              </div>
            </div>

            {/* Sélecteurs des 7 jours */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2">
              {NOMS_JOURS_SEMAINE.map((nomJour, idx) => {
                const isActive = params.joursOuvres.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleJourOuvre(idx)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold text-center border-2 transition-all flex flex-col items-center gap-1 ${
                      isActive
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 opacity-60'
                    }`}
                  >
                    <span className="text-[10px] tracking-wider uppercase">{nomJour}</span>
                    <span className="text-xs">
                      {isActive ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-3.5 h-3.5" /> Ouvré
                        </span>
                      ) : (
                        <span className="text-slate-500">Repos</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Heures de travail journalières et Minutes totales par jour */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-300 border-t border-slate-800/80">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Base horaire de calcul :</span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={params.heuresTravailParJour || 8}
                  onChange={e =>
                    setParams({
                      ...params,
                      heuresTravailParJour: Math.max(1, parseInt(e.target.value, 10) || 8)
                    })
                  }
                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center font-bold text-white font-mono"
                />
                <span>heures par jour ouvré</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300">
                Capacité journalière : <strong>{(params.heuresTravailParJour || 8) * 60} minutes</strong> / jour
              </div>
            </div>

            {/* Option d'ordonnancement : Combler les créneaux libres (Journées pleines à 100%) */}
            <div className={`p-4 rounded-xl border transition ${
              params.comblerVidesProduction
                ? 'bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/30'
                : 'bg-slate-900/60 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${params.comblerVidesProduction ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-white">
                      Combler les créneaux libres (Optimisation journées pleines à 100%)
                    </span>
                    {params.comblerVidesProduction ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                        ACTIF
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold border border-slate-700">
                        STANDARD (FIFO)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Au lieu de placer systématiquement chaque commande à la suite de la dernière commande de la famille, le système calcule le temps en minutes ({params.heuresTravailParJour || 8}h × 60 = {(params.heuresTravailParJour || 8) * 60} min/jour) et recherche s'il existe des <strong>créneaux vides disponibles dans les journées antérieures</strong> pour y intercaler la commande et saturer les journées à 100%.
                  </p>
                  <p className="text-[10px] text-slate-400 italic">
                    {params.comblerVidesProduction
                      ? '✓ Activé : les commandes courtes s’insèrent dans les temps résiduels des journées antérieures sans retarder le reste de l’atelier.'
                      : 'Par défaut : chaque commande fait la queue après la dernière commande de la famille.'}
                  </p>
                </div>

                <div className="shrink-0 pt-0.5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!params.comblerVidesProduction}
                      onChange={e =>
                        setParams({
                          ...params,
                          comblerVidesProduction: e.target.checked
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2 : CADENCE PAR FAMILLE */}
          <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Grille des Cadences &amp; Capacités de Fabrication</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Définissez le temps de fabrication par unité ou la capacité moyenne journalière (ex: 5 min/caisson ou 120 caissons/jour).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['CAISSON', 'PRECADRE', 'MOUSTIQUAIRE', 'TABLIER'] as FamilleProduit[]).map(fam => {
                const conf = params.familles[fam] || PARAMETRES_PRODUCTION_DEFAUT.familles[fam];
                const totalMinutesJour = (params.heuresTravailParJour || 8) * 60;
                const tempsMin = conf.tempsUnitaireMinutes || Math.max(1, Math.round(totalMinutesJour / (conf.capaciteJournalierePieces || 10)));
                const capaciteJour = conf.capaciteJournalierePieces || Math.max(1, Math.round(totalMinutesJour / tempsMin));
                const cadenceParMinute = (1 / tempsMin).toFixed(2);
                
                const unitSingular = fam === 'CAISSON' ? 'caisson' : fam === 'TABLIER' ? 'tablier' : fam === 'MOUSTIQUAIRE' ? 'moustiquaire' : 'précadre';
                const unitPlural = fam === 'CAISSON' ? 'caissons' : fam === 'TABLIER' ? 'tabliers' : fam === 'MOUSTIQUAIRE' ? 'moustiquaires' : 'précadres';
                const unitMinute = `${unitSingular} par minute`;
                const charge50 = ((50 * tempsMin) / totalMinutesJour).toFixed(2);
                const charge100 = ((100 * tempsMin) / totalMinutesJour).toFixed(2);

                return (
                  <div
                    key={fam}
                    className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                          {getFamilleIcon(fam)}
                        </div>
                        <div>
                          <h5 className="text-sm font-bold text-white">{conf.libelle}</h5>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            Code : {fam}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                        {cadenceParMinute} {unitMinute}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {/* Temps unitaire en minutes */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Temps unitaire (Minutes) :
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="600"
                            value={tempsMin}
                            onChange={e =>
                              updateFamille(fam, 'tempsUnitaireMinutes', parseFloat(e.target.value) || 1)
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono font-bold text-amber-300 text-center focus:border-amber-400 outline-hidden"
                          />
                          <span className="text-xs text-slate-400 font-semibold shrink-0">min / pc</span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          = 1 {unitSingular} / {tempsMin} min
                        </span>
                      </div>

                      {/* Capacité journalière en pièces */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Capacité Journalière :
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="2000"
                            value={capaciteJour}
                            onChange={e =>
                              updateFamille(fam, 'capaciteJournalierePieces', parseInt(e.target.value, 10) || 1)
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono font-bold text-emerald-400 text-center focus:border-emerald-400 outline-hidden"
                          />
                          <span className="text-xs text-slate-400 font-semibold shrink-0">{unitPlural} / j</span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          sur {params.heuresTravailParJour || 8}h/jour
                        </span>
                      </div>
                    </div>

                    {/* Calcul en jours explicite */}
                    <div className="text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-slate-300 font-medium">
                        <span className="italic">📊 Calcul en jours ouvrés :</span>
                        <strong className="text-emerald-400 font-mono">
                          1 jour = {capaciteJour} {unitPlural} ({totalMinutesJour} min)
                        </strong>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                        <span>Charge 50 {unitPlural} = <strong className="text-amber-300 font-mono">{charge50} j</strong></span>
                        <span>Charge 100 {unitPlural} = <strong className="text-amber-300 font-mono">{charge100} j</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3 : TOURNÉES DE LIVRAISON PAR DESTINATION & OPTIMISATION PETITES COMMANDES */}
          <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-400" />
                <span>Tournées de Livraison &amp; Délais Spécifiques (Oran, Constantine, Alger...)</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Configurez les jours de livraison fixes par destination (ex: Constantine = Lundi &amp; Mercredi, Oran = Dimanche &amp; Mardi) et l'affectation automatique du délai le plus court pour les petites commandes (&le; 2 pièces).
              </p>
            </div>

            <div className="space-y-3">
              {(params.tourneesDestinations || TOURNEES_DESTINATIONS_DEFAUT).map(tournee => {
                const isOran = tournee.id === 'oran';
                const isCne = tournee.id === 'cne';
                const isAlger = tournee.id === 'alger';

                return (
                  <div
                    key={tournee.id}
                    className={`p-4 rounded-xl border transition ${
                      isCne
                        ? 'bg-blue-950/30 border-blue-800/60'
                        : isOran
                        ? 'bg-amber-950/30 border-amber-800/60'
                        : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className={`w-4 h-4 ${isCne ? 'text-blue-400' : isOran ? 'text-amber-400' : 'text-emerald-400'}`} />
                        <h5 className="text-sm font-bold text-white">{tournee.nom}</h5>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {tournee.keywords.slice(0, 3).join(', ')}
                        </span>
                      </div>

                      {/* Option Express petites commandes */}
                      <div className="flex items-center gap-2 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
                          <input
                            type="checkbox"
                            checked={tournee.delaiExpressPetitesCommandes}
                            onChange={() => toggleTourneeExpress(tournee.id)}
                            className="w-3.5 h-3.5 accent-amber-400 rounded"
                          />
                          <span className="font-semibold text-[11px]">Délai le plus court pour :</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={tournee.maxPiecesExpress || 2}
                          onChange={e => updateTourneeMaxPieces(tournee.id, parseInt(e.target.value, 10) || 2)}
                          className="w-12 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono font-bold text-amber-300"
                        />
                        <span className="text-[11px] text-slate-400">pièces max</span>
                      </div>
                    </div>

                    {/* Sélecteur des jours de livraison pour cette destination */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-400">
                        Jours de départ / livraison atelier :
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {NOMS_JOURS_SEMAINE.map((nomJour, idx) => {
                          const isSelected = tournee.joursLivraison.includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => toggleJourTournee(tournee.id, idx)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                                isSelected
                                  ? isCne
                                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                    : isOran
                                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                                    : 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                  : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              {nomJour.slice(0, 3)}
                              {isSelected && <span className="ml-1 text-[10px]">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-slate-400 italic pt-1">
                        {isCne && 'Constantine est planifié les Lundis et Mercredis. Les commandes sont optimisées pour être prêtes avant ces départs.'}
                        {isOran && 'Oran est planifié les Dimanches et Mardis. Les commandes sont optimisées pour être prêtes avant ces départs.'}
                        {isAlger && 'Somadal / Cristal Alger bénéficient de livraisons régulières et du délai le plus rapide possible.'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Note explicative du fonctionnement FIFO */}
          <div className="bg-sky-950/30 border border-sky-800/50 p-3.5 rounded-xl text-xs text-sky-200 flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sky-100">Règle de file d'attente FIFO par Famille :</p>
              <p className="text-sky-300/90 text-[11px]">
                Pour chaque nouvelle commande, le système additionne le volume restant de tous les travaux en cours de la même famille (ex: Caissons), y ajoute le temps propre à la commande, puis projette la date prévisionnelle sur le calendrier selon vos jours ouvrés cochés.
              </p>
            </div>
          </div>
        </div>

        {/* Footer avec boutons d'action */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Valeurs d'usine</span>
          </button>

          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 animate-pulse">
                <Check className="w-4 h-4" /> Paramètres enregistrés avec succès !
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-5 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Enregistrement...' : 'Enregistrer les Réglages'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
