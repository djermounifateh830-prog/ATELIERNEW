import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Zap, Check, AlertCircle, Sparkles, RefreshCw, PauseCircle, PlayCircle, AlertTriangle } from 'lucide-react';
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
  const [typePriorite, setTypePriorite] = useState<'INSTANTANE' | 'DIFFERE'>('DIFFERE');
  const [estPrioritaire, setEstPrioritaire] = useState<boolean>(false);
  const [motifPriorite, setMotifPriorite] = useState<string>('');
  const [dateSelectionnee, setDateSelectionnee] = useState<string>('');
  const [textePrevisualisation, setTextePrevisualisation] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // État de mise en pause de la commande (terrain / rupture stock)
  const [estEnPause, setEstEnPause] = useState<boolean>(false);
  const [motifPause, setMotifPause] = useState<string>('');

  // Initialisation à l'ouverture pour l'OF cible
  useEffect(() => {
    if (!isOpen || !of) return;

    const isInst = of.typePriorite === 'INSTANTANE' || !!of.estPrioritaire;
    setTypePriorite(isInst ? 'INSTANTANE' : 'DIFFERE');
    setEstPrioritaire(isInst);
    setMotifPriorite(of.motifPriorite || '');
    setEstEnPause(of.estEnPause || of.statut === 'EN_PAUSE' || false);
    setMotifPause(of.motifPause || '');

    // Synchronisation avec le dossier si présent
    StorageService.getDossiers().then(dossiers => {
      const cmdRef = (of.numCommande || '').trim().toLowerCase();
      const match = dossiers.find(d => {
        const r = (d.refCommande || '').trim().toLowerCase();
        const c = (d.numCommandeCaisson || '').trim().toLowerCase();
        const t = (d.numCommandeTablier || '').trim().toLowerCase();
        const m = (d.numCommandeMoustiquaire || '').trim().toLowerCase();
        const p = (d.numCommandePrecadre || '').trim().toLowerCase();
        return (
          r === cmdRef || c === cmdRef || t === cmdRef || m === cmdRef || p === cmdRef ||
          (r && cmdRef.includes(r)) || (c && cmdRef.includes(c)) || (t && cmdRef.includes(t)) || (m && cmdRef.includes(m)) || (p && cmdRef.includes(p))
        );
      });
      if (match) {
        if (match.estEnPause !== undefined) setEstEnPause(!!match.estEnPause);
        if (match.motifPause) setMotifPause(match.motifPause);
        // Si le dossier a une date personnalisée ou par famille
        const famKey = (of.famille || '').toUpperCase();
        const customFamDate = match.datesLivraisonCommandes?.[famKey];
        const dateISOFromDossier = customFamDate?.dateLivraisonISO || match.dateLivraisonPrevisionnelleISO;
        if (dateISOFromDossier && !of.dateLivraisonPrevisionnelleISO) {
          setDateSelectionnee(dateISOFromDossier);
        }
        if (match.typePriorite && of.typePriorite === undefined) {
          setTypePriorite(match.typePriorite);
          setEstPrioritaire(match.typePriorite === 'INSTANTANE');
        }
      }
    }).catch(() => {});

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
    if (estEnPause) {
      setTextePrevisualisation('⏸️ EN PAUSE');
      return;
    }
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
          const datePure = texteFormatte.replace(/^(LIVRAISON\s*PR[EÉ]VUE|D[EÉ]LAI\s*PR[EÉ]VISIONNEL|D[EÉ]LAI|LIVRAISON)\s*:\s*/i, '').trim();
          if (typePriorite === 'INSTANTANE') {
            setTextePrevisualisation(`⚡ INSTANTANÉ : ${datePure}`);
          } else {
            setTextePrevisualisation(datePure);
          }
          return;
        }
      }
    } catch {
      // ignore
    }
    setTextePrevisualisation(typePriorite === 'INSTANTANE' ? '⚡ INSTANTANÉ' : 'Date fixée');
  }, [dateSelectionnee, typePriorite, estEnPause]);

  if (!isOpen || !of) return null;

  // Raccourcis rapides de date
  const appliquerRaccourci = (joursAjoutes: number) => {
    if (joursAjoutes === 0) {
      const aujourdhui = new Date();
      setDateSelectionnee(DelaisProductionService.toISODateString(aujourdhui));
      return;
    }
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

  // Calcul du volume et de la cadence pour la famille de cet OF
  const paramsProd = DelaisProductionService.getParametres();
  const famKey = (((of.famille as string) === 'SOUS_FACE' ? 'CAISSON' : of.famille) || 'CAISSON') as keyof typeof paramsProd.familles;
  const configFamille = paramsProd.familles[famKey] || paramsProd.familles.CAISSON;
  const nbPiecesOF = DelaisProductionService.compterPiecesOF(of);
  const dateSystemeAujStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  const handleSave = async () => {
    if (!of || (!dateSelectionnee && !estEnPause)) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const updatedOF: SuiviOF = {
        ...of,
        typePriorite,
        estPrioritaire: typePriorite === 'INSTANTANE',
        motifPriorite: typePriorite === 'INSTANTANE' ? motifPriorite.trim() : undefined,
        dateLivraisonPrevisionnelle: estEnPause ? '⏸️ EN PAUSE' : textePrevisualisation,
        dateLivraisonPrevisionnelleISO: dateSelectionnee,
        estEnPause,
        motifPause: estEnPause ? (motifPause.trim() || 'Interruption terrain / Rupture stock') : undefined,
        datePause: estEnPause ? (of.datePause || new Date().toISOString()) : undefined,
        statut: estEnPause ? 'EN_PAUSE' : (of.statut === 'EN_PAUSE' ? 'EMIS' : of.statut)
      };

      // 1. Sauvegarde dans SQLite via StorageService
      await StorageService.upsertSuiviOF(updatedOF);

      // 2. Synchroniser le dossier de commande correspondant s'il existe
      try {
        const dossiers = await StorageService.getDossiers();
        const cmdRef = (of.numCommande || '').trim().toLowerCase();
        let dossierModifie = false;

        const updatedDossiers = dossiers.map(d => {
          const r = (d.refCommande || '').trim().toLowerCase();
          const c = (d.numCommandeCaisson || '').trim().toLowerCase();
          const t = (d.numCommandeTablier || '').trim().toLowerCase();
          const m = (d.numCommandeMoustiquaire || '').trim().toLowerCase();
          const p = (d.numCommandePrecadre || '').trim().toLowerCase();
          const matchRef =
            r === cmdRef || c === cmdRef || t === cmdRef || m === cmdRef || p === cmdRef ||
            (r && cmdRef.includes(r)) || (c && cmdRef.includes(c)) || (t && cmdRef.includes(t)) || (m && cmdRef.includes(m)) || (p && cmdRef.includes(p));

          if (matchRef) {
            dossierModifie = true;
            const famKey = (of.famille || '').toUpperCase();
            const datesLivraisonCommandes = { ...(d.datesLivraisonCommandes || {}) };
            if (famKey) {
              datesLivraisonCommandes[famKey] = {
                dateLivraisonPrevisionnelle: estEnPause ? '⏸️ EN PAUSE' : textePrevisualisation,
                dateLivraisonISO: dateSelectionnee,
                joursOuvres: d.delaiPrevisionnelJours || 0,
                typePriorite
              };
            }

            return {
              ...d,
              typePriorite,
              estPrioritaire: typePriorite === 'INSTANTANE',
              motifPriorite: typePriorite === 'INSTANTANE' ? motifPriorite.trim() : undefined,
              dateLivraisonPrevisionnelle: estEnPause ? '⏸️ EN PAUSE' : textePrevisualisation,
              dateLivraisonPrevisionnelleISO: dateSelectionnee,
              datesLivraisonCommandes,
              estEnPause,
              motifPause: estEnPause ? (motifPause.trim() || 'Interruption terrain / Rupture stock') : undefined,
              datePause: estEnPause ? (d.datePause || new Date().toISOString()) : undefined,
              statut: estEnPause ? 'EN_PAUSE' : (d.statut === 'EN_PAUSE' ? 'EN_ATTENTE' : d.statut)
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
              typePriorite === 'INSTANTANE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {typePriorite === 'INSTANTANE' ? <Zap className="w-5 h-5 fill-rose-400" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Date de Fixation &amp; Priorité Commande</span>
                {typePriorite === 'INSTANTANE' && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] uppercase font-black tracking-wide border border-rose-500/40">
                    ⚡ Instantané
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

          {/* Récapitulatif commande, client, volume & cadence famille */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
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

            {/* Détail Volume & Cadence de la famille */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-cyan-300 font-mono">
                <span className="text-slate-400">Volume calculé :</span>
                <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60 font-bold">{nbPiecesOF} pièce(s)</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400">Cadence atelier :</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  {configFamille.capaciteJournalierePieces} pcs / jour
                </span>
              </div>
              <div className="text-purple-300 text-[11px] font-mono flex items-center gap-1">
                <Calendar className="w-3 h-3 text-purple-400" />
                <span className="text-slate-400">Aujourd'hui :</span>
                <span className="font-bold capitalize">{dateSystemeAujStr}</span>
              </div>
            </div>
          </div>

          {/* Mise en pause de la commande (Rupture stock, attente terrain) */}
          <div className={`p-4 rounded-xl border transition-all ${
            estEnPause
              ? 'bg-amber-950/40 border-amber-500 shadow-md ring-1 ring-amber-500/50'
              : 'bg-slate-950/70 border-slate-800'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  estEnPause ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">
                      Mise en pause de la commande
                    </span>
                    {estEnPause && (
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black font-mono text-[10px] animate-pulse">
                        EN PAUSE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Gèle la production pour rupture de stock ou attente validation terrain.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEstEnPause(!estEnPause)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  estEnPause
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                }`}
              >
                {estEnPause ? (
                  <>
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Reprendre</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Mettre en Pause</span>
                  </>
                )}
              </button>
            </div>

            {estEnPause && (
              <div className="mt-3 pt-3 border-t border-amber-500/30">
                <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                  Motif de l'arrêt / rupture de stock (affiché sur l'atelier) :
                </label>
                <input
                  type="text"
                  value={motifPause}
                  onChange={(e) => setMotifPause(e.target.value)}
                  placeholder="ex: Rupture profilé blanc, Attente confirmation dimensions..."
                  className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {/* Type de Priorité Commande : Instantané vs Différé */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Type de Priorité Commande :
            </span>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setTypePriorite('INSTANTANE');
                  setEstPrioritaire(true);
                  appliquerRaccourci(0);
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                  typePriorite === 'INSTANTANE'
                    ? 'bg-rose-950/40 border-rose-500 text-rose-200 shadow-md ring-1 ring-rose-500/50'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className={`w-4 h-4 ${typePriorite === 'INSTANTANE' ? 'text-rose-400 fill-rose-400' : 'text-slate-500'}`} />
                    <span className="font-bold text-xs text-white">⚡ Instantané</span>
                  </div>
                  {typePriorite === 'INSTANTANE' && <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Fabrication immédiate. Classé au-devant des autres dans la file atelier.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTypePriorite('DIFFERE');
                  setEstPrioritaire(false);
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                  typePriorite === 'DIFFERE'
                    ? 'bg-sky-950/40 border-sky-500 text-sky-200 shadow-md ring-1 ring-sky-500/50'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock className={`w-4 h-4 ${typePriorite === 'DIFFERE' ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span className="font-bold text-xs text-white">⏳ Différé</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Planification normale selon la file d'attente et tournées de livraison.
                </p>
              </button>
            </div>

            {/* Motif si instantané */}
            {typePriorite === 'INSTANTANE' && (
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-rose-300 mb-1">
                  Motif de la priorité instantanée (optionnel) :
                </label>
                <input
                  type="text"
                  value={motifPriorite}
                  onChange={(e) => setMotifPriorite(e.target.value)}
                  placeholder="ex: Urgence chantier, Remplacement immédiat..."
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
            disabled={isSaving || (!dateSelectionnee && !estEnPause)}
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
