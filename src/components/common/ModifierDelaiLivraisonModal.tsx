import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Zap, Check, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { SuiviOF, DossierCommandeGlobal } from '../../types';
import { DelaisProductionService } from '../../services/delaisProductionService';
import { StorageService } from '../../services/storage';

interface ModifierDelaiLivraisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  of: SuiviOF | null;
  suivisOF: SuiviOF[];
  onSaved: (updatedOF: SuiviOF) => void;
}

export const ModifierDelaiLivraisonModal: React.FC<ModifierDelaiLivraisonModalProps> = ({
  isOpen,
  onClose,
  of,
  suivisOF,
  onSaved
}) => {
  const [estPrioritaire, setEstPrioritaire] = useState<boolean>(false);
  const [motifPriorite, setMotifPriorite] = useState<string>('');
  const [dateSelectionnee, setDateSelectionnee] = useState<string>('');
  const [textePrevisualisation, setTextePrevisualisation] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialisation à l'ouverture pour l'OF cible
  useEffect(() => {
    if (!isOpen || !of) return;

    setEstPrioritaire(!!of.estPrioritaire);
    setMotifPriorite(of.motifPriorite || '');

    // Récupérer la date existante ou calculée
    if (of.dateLivraisonPrevisionnelleISO) {
      setDateSelectionnee(of.dateLivraisonPrevisionnelleISO);
    } else {
      const calcul = DelaisProductionService.estimerDelaiOF(of, suivisOF);
      setDateSelectionnee(calcul.dateLivraisonISO);
    }
  }, [isOpen, of, suivisOF]);

  // Recalcul du texte de prévisualisation dès que la date ou le statut prioritaire change
  useEffect(() => {
    if (!dateSelectionnee) {
      setTextePrevisualisation('');
      return;
    }

    try {
      const parts = dateSelectionnee.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(d.getTime())) {
          const texteFormatte = DelaisProductionService.formaterDateLivraison(d);
          if (estPrioritaire) {
            setTextePrevisualisation(`⚡ PRIORITAIRE : ${texteFormatte.replace(/^LIVRAISON\s*:\s*/i, '')}`);
          } else {
            setTextePrevisualisation(texteFormatte);
          }
          return;
        }
      }
    } catch {
      // ignore
    }
    setTextePrevisualisation(estPrioritaire ? '⚡ PRIORITAIRE' : 'Date de livraison définie');
  }, [dateSelectionnee, estPrioritaire]);

  if (!isOpen || !of) return null;

  // Raccourcis rapides de date
  const appliquerRaccourci = (joursAjoutes: number) => {
    const params = DelaisProductionService.getParametres();
    const aujourdhui = new Date();
    const cible = DelaisProductionService.ajouterJoursOuvres(aujourdhui, joursAjoutes, params.joursOuvres);
    setDateSelectionnee(DelaisProductionService.toISODateString(cible));
  };

  const reinitialiserAutomatique = () => {
    const ofCopie: SuiviOF = { ...of, estPrioritaire: false, dateLivraisonPrevisionnelle: undefined, dateLivraisonPrevisionnelleISO: undefined };
    const estim = DelaisProductionService.estimerDelaiOF(ofCopie, suivisOF);
    setDateSelectionnee(estim.dateLivraisonISO);
    setEstPrioritaire(false);
    setMotifPriorite('');
  };

  const handleSave = async () => {
    if (!of || !dateSelectionnee) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const updatedOF: SuiviOF = {
        ...of,
        estPrioritaire,
        motifPriorite: estPrioritaire ? motifPriorite.trim() : undefined,
        dateLivraisonPrevisionnelle: textePrevisualisation,
        dateLivraisonPrevisionnelleISO: dateSelectionnee
      };

      // 1. Sauvegarde dans SQLite via StorageService
      await StorageService.upsertSuiviOF(updatedOF);

      // 2. Synchroniser le dossier de commande correspondant s'il existe
      try {
        const dossiers = await StorageService.getDossiers();
        const cmdRef = (of.numCommande || '').trim().toLowerCase();
        let dossierModifie = false;

        const updatedDossiers = dossiers.map(d => {
          const matchRef = (d.refCommande || '').trim().toLowerCase() === cmdRef ||
            (d.numCommandeCaisson || '').trim().toLowerCase() === cmdRef ||
            (d.numCommandeTablier || '').trim().toLowerCase() === cmdRef ||
            (d.numCommandeMoustiquaire || '').trim().toLowerCase() === cmdRef ||
            (d.numCommandePrecadre || '').trim().toLowerCase() === cmdRef;

          if (matchRef) {
            dossierModifie = true;
            return {
              ...d,
              estPrioritaire,
              motifPriorite: estPrioritaire ? motifPriorite.trim() : undefined,
              dateLivraisonPrevisionnelle: textePrevisualisation,
              dateLivraisonPrevisionnelleISO: dateSelectionnee
            };
          }
          return d;
        });

        if (dossierModifie) {
          await StorageService.saveDossiers(updatedDossiers);
        }
      } catch (err) {
        console.warn('Sync dossier non bloquante:', err);
      }

      onSaved(updatedOF);
      onClose();
    } catch (err: any) {
      console.error('Erreur enregistrement date livraison OF:', err);
      setErrorMsg(err?.message || 'Une erreur est survenue lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              estPrioritaire ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {estPrioritaire ? <Zap className="w-5 h-5 fill-rose-400" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Date de Livraison &amp; Priorité</span>
                {estPrioritaire && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] uppercase font-black tracking-wide border border-rose-500/40">
                    ⚡ Prioritaire
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {of.codeOF || `OF N°${of.numeroEmission || 1}`} • Commande : <span className="text-slate-200 font-bold">{of.numCommande}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps du modal */}
        <div className="p-5 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-950/50 border border-rose-500/50 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Récapitulatif commande & client */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Client</span>
              <span className="font-bold text-white text-sm">{of.nomClient || 'Non spécifié'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Famille &amp; Section</span>
              <span className="font-mono text-slate-200 font-semibold">{of.famille} — {of.titreSection}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Émis le</span>
              <span className="font-mono text-slate-300">{of.dateEmission}</span>
            </div>
          </div>

          {/* Activation Commande Prioritaire */}
          <div className={`p-4 rounded-xl border transition ${
            estPrioritaire
              ? 'bg-rose-950/30 border-rose-500/50 shadow-inner'
              : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className={`p-2 rounded-lg mt-0.5 ${
                  estPrioritaire ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/40 text-slate-400'
                }`}>
                  <Zap className={`w-4 h-4 ${estPrioritaire ? 'fill-rose-400 text-rose-400' : ''}`} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Commande Prioritaire / Urgente</span>
                    {estPrioritaire && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white font-mono text-[9px] font-black uppercase">
                        Actif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Priorise cet ordre dans le planning atelier et place le badge <strong>⚡ PRIORITAIRE</strong> sur les fiches de coupe et le suivi.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={estPrioritaire}
                onClick={() => {
                  const nouveauStatut = !estPrioritaire;
                  setEstPrioritaire(nouveauStatut);
                  if (nouveauStatut && !dateSelectionnee) {
                    // Si on active la priorité, proposer aujourd'hui ou demain
                    appliquerRaccourci(1);
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  estPrioritaire ? 'bg-rose-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    estPrioritaire ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Motif de la priorité */}
            {estPrioritaire && (
              <div className="mt-3 pt-3 border-t border-rose-500/30">
                <label className="block text-xs font-bold text-rose-300 mb-1">
                  Motif de la priorité (optionnel) :
                </label>
                <input
                  type="text"
                  value={motifPriorite}
                  onChange={(e) => setMotifPriorite(e.target.value)}
                  placeholder="ex: Chantier urgent, Demande expresse client, Remplacement SAV..."
                  className="w-full bg-slate-900 border border-rose-500/40 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-rose-400"
                />
              </div>
            )}
          </div>

          {/* Choix de la Date de Livraison */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Date de Livraison Souhaitée :
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={dateSelectionnee}
                  onChange={(e) => setDateSelectionnee(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white font-mono font-bold focus:outline-hidden focus:border-amber-400"
                />
              </div>
            </div>

            {/* Raccourcis Rapides */}
            <div>
              <span className="text-[11px] text-slate-400 block mb-1.5">Raccourcis rapides :</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    appliquerRaccourci(0);
                    setEstPrioritaire(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1 transition"
                >
                  <Zap className="w-3 h-3 fill-rose-400" />
                  <span>Aujourd'hui (Urgentissime)</span>
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  Demain (+1j)
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(2)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  +2 jours
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(3)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  +3 jours
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(5)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  +1 semaine
                </button>
                <button
                  type="button"
                  onClick={reinitialiserAutomatique}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/35 text-xs font-bold flex items-center gap-1 transition ml-auto"
                  title="Recalculer automatiquement selon la capacité atelier"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Délai Standard Auto</span>
                </button>
              </div>
            </div>
          </div>

          {/* Prévisualisation de l'affichage final */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
              Prévisualisation sur l'Ordre de Fabrication &amp; Suivi :
            </span>
            <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 font-mono font-bold text-xs sm:text-sm ${
              estPrioritaire
                ? 'bg-rose-950/50 border-rose-500/60 text-rose-200'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
            }`}>
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${estPrioritaire ? 'text-rose-400' : 'text-amber-400'}`} />
                <span>{textePrevisualisation || 'Sélectionnez une date'}</span>
              </div>
              {estPrioritaire && (
                <span className="px-2 py-0.5 rounded bg-rose-500 text-white font-mono text-[10px] font-black uppercase">
                  ⚡ PRIO
                </span>
              )}
            </div>
            {motifPriorite && estPrioritaire && (
              <p className="text-[11px] text-rose-300/80 italic pl-1">
                Motif : "{motifPriorite}"
              </p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 bg-slate-950/70">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !dateSelectionnee}
            className={`px-5 py-2 rounded-xl text-white text-xs font-black flex items-center gap-1.5 shadow-lg transition ${
              estPrioritaire
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30'
                : 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Enregistrer la Date</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
