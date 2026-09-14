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
  AlertCircle
} from 'lucide-react';
import {
  ParametresProductionAtelier,
  FamilleProduit
} from '../../types';
import {
  DelaisProductionService,
  PARAMETRES_PRODUCTION_DEFAUT,
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
      case 'SOUS_FACE':
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

            {/* Heures de travail journalières */}
            <div className="flex items-center gap-3 pt-2 text-xs text-slate-300 border-t border-slate-800/80">
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
                        {conf.capaciteJournalierePieces} pcs/jour
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {/* Temps unitaire en minutes */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Temps unitaire :
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="600"
                            value={conf.tempsUnitaireMinutes}
                            onChange={e =>
                              updateFamille(fam, 'tempsUnitaireMinutes', parseFloat(e.target.value) || 1)
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono font-bold text-white text-center focus:border-amber-400 outline-hidden"
                          />
                          <span className="text-xs text-slate-400 font-semibold">min/pc</span>
                        </div>
                      </div>

                      {/* Capacité journalière en pièces */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Capacité journalière :
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="2000"
                            value={conf.capaciteJournalierePieces}
                            onChange={e =>
                              updateFamille(fam, 'capaciteJournalierePieces', parseInt(e.target.value, 10) || 1)
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono font-bold text-white text-center focus:border-amber-400 outline-hidden"
                          />
                          <span className="text-xs text-slate-400 font-semibold">pcs/j</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
                      <span className="italic">Cadence calculée :</span>
                      <strong className="text-emerald-400 font-mono">
                        ≈ {(conf.capaciteJournalierePieces / (params.heuresTravailParJour || 8)).toFixed(1)} pcs / heure
                      </strong>
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
