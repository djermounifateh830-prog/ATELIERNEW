import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  Zap,
  Check,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  Save,
  ShieldCheck,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Pause
} from 'lucide-react';
import { FamilleProduit, EstimationLivraisonDossier, EstimationDelaiDetail } from '../../types';
import { DelaisProductionService } from '../../services/delaisProductionService';

interface ValidationDelaiCommandeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSave: (
    dateFinaleISO: string,
    dateFinaleTexte: string,
    estPrioritaire: boolean,
    motifPriorite?: string,
    estEnPause?: boolean,
    motifPause?: string
  ) => Promise<void> | void;
  onApplyOnly?: (
    dateFinaleISO: string,
    dateFinaleTexte: string,
    estPrioritaire: boolean,
    motifPriorite?: string,
    estEnPause?: boolean,
    motifPause?: string
  ) => void;
  refCommande: string;
  nomClient: string;
  donneurOrdre?: string;
  dateCommande: string;
  estimationGlobale: EstimationLivraisonDossier;
  isSaving?: boolean;
  isUpdate?: boolean;
  initialEstPrioritaire?: boolean;
  initialMotifPriorite?: string;
  initialDateLivraisonISO?: string;
  initialEstEnPause?: boolean;
  initialMotifPause?: string;
}

export const ValidationDelaiCommandeModal: React.FC<ValidationDelaiCommandeModalProps> = ({
  isOpen,
  onClose,
  onConfirmSave,
  onApplyOnly,
  refCommande,
  nomClient,
  donneurOrdre,
  dateCommande,
  estimationGlobale,
  isSaving = false,
  isUpdate = false,
  initialEstPrioritaire = false,
  initialMotifPriorite = '',
  initialDateLivraisonISO = '',
  initialEstEnPause = false,
  initialMotifPause = ''
}) => {
  const [estPrioritaire, setEstPrioritaire] = useState<boolean>(initialEstPrioritaire);
  const [motifPriorite, setMotifPriorite] = useState<string>(initialMotifPriorite);
  const [estEnPause, setEstEnPause] = useState<boolean>(initialEstEnPause);
  const [motifPause, setMotifPause] = useState<string>(initialMotifPause);
  const [dateSelectionneeISO, setDateSelectionneeISO] = useState<string>('');
  const [modeDate, setModeDate] = useState<'AUTO' | 'MANUEL'>('AUTO');
  const [expandedFamilles, setExpandedFamilles] = useState<Record<string, boolean>>({});

  const toggleFamilleExpanded = (fam: string) => {
    setExpandedFamilles(prev => ({ ...prev, [fam]: !prev[fam] }));
  };

  const paramsProd = DelaisProductionService.getParametres();
  const dateSystemeStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  // Initialisation à l'ouverture
  useEffect(() => {
    if (!isOpen) return;

    setEstPrioritaire(initialEstPrioritaire);
    setMotifPriorite(initialMotifPriorite);
    setEstEnPause(initialEstEnPause);
    setMotifPause(initialMotifPause || '');

    if (initialDateLivraisonISO && initialDateLivraisonISO !== estimationGlobale.dateLivraisonISO) {
      setDateSelectionneeISO(initialDateLivraisonISO);
      setModeDate('MANUEL');
    } else if (estimationGlobale.dateLivraisonISO) {
      setDateSelectionneeISO(estimationGlobale.dateLivraisonISO);
      setModeDate('AUTO');
    } else if (estimationGlobale.dateMaximale) {
      setDateSelectionneeISO(DelaisProductionService.toISODateString(estimationGlobale.dateMaximale));
      setModeDate('AUTO');
    } else {
      const auj = DelaisProductionService.toISODateString(new Date());
      setDateSelectionneeISO(auj);
      setModeDate('AUTO');
    }
  }, [isOpen, initialDateLivraisonISO, initialEstPrioritaire, initialMotifPriorite, initialEstEnPause, initialMotifPause, estimationGlobale.dateLivraisonISO, estimationGlobale.dateMaximale]);

  // Synchronisation dynamique si en mode AUTO
  useEffect(() => {
    if (modeDate === 'AUTO' && estimationGlobale.dateLivraisonISO) {
      setDateSelectionneeISO(estimationGlobale.dateLivraisonISO);
    }
  }, [estimationGlobale.dateLivraisonISO, modeDate]);

  if (!isOpen) return null;

  // Calcul du libellé formaté de la date sélectionnée
  const getDateAfficheeFormatee = (iso: string): string => {
    if (!iso) return 'Non définie';
    const parts = iso.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) {
        return DelaisProductionService.formaterDateLivraison(d);
      }
    }
    return iso;
  };

  const appliquerRaccourci = (joursAjoutes: number) => {
    setModeDate('MANUEL');
    if (joursAjoutes === 0) {
      const auj = new Date();
      setDateSelectionneeISO(DelaisProductionService.toISODateString(auj));
      setEstPrioritaire(true);
      return;
    }
    const params = DelaisProductionService.getParametres();
    // Les raccourcis partent d'aujourd'hui pour un délai de livraison réel
    const dRef = new Date();
    const cible = DelaisProductionService.ajouterJoursOuvres(dRef, joursAjoutes, params.joursOuvres);
    setDateSelectionneeISO(DelaisProductionService.toISODateString(cible));
  };

  const resetToAuto = () => {
    setModeDate('AUTO');
    setEstPrioritaire(false);
    if (estimationGlobale.dateLivraisonISO) {
      setDateSelectionneeISO(estimationGlobale.dateLivraisonISO);
    }
  };

  const handleValider = async () => {
    const txtFormatte = getDateAfficheeFormatee(dateSelectionneeISO);
    const dateFinaleTexte = estPrioritaire
      ? `⚡ PRIORITAIRE : ${txtFormatte.replace(/^LIVRAISON\s*:\s*/i, '')}`
      : txtFormatte;

    await onConfirmSave(dateSelectionneeISO, dateFinaleTexte, estPrioritaire, motifPriorite);
  };

  const detailsArray: EstimationDelaiDetail[] = Object.values(estimationGlobale.detailsParFamille || {});

  // Icône et couleur par famille
  const getFamilleStyle = (fam: FamilleProduit) => {
    switch (fam) {
      case 'CAISSON':
        return { label: 'Caissons & Sous-Faces', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' };
      case 'TABLIER':
        return { label: 'Volets & Tabliers', bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/30' };
      case 'PRECADRE':
        return { label: 'Précadres', bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' };
      case 'MOUSTIQUAIRE':
        return { label: 'Moustiquaires', bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' };
      default:
        return { label: fam, bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Validation Délai de Fabrication &amp; Livraison</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {isUpdate ? 'Mise à jour' : 'Nouvelle commande'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Commande <span className="text-amber-300 font-bold">{refCommande}</span> • Client : <span className="text-slate-200 font-semibold">{nomClient}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Bannière Date Système */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-mono">
              <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Aujourd'hui (Système atelier) :</span>
              <strong className="text-purple-300 capitalize">{dateSystemeStr}</strong>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Date d'émission commande : <strong className="text-slate-200">{dateCommande}</strong>
            </div>
          </div>

          {/* TABLEAU DE CALCUL DE VOLUME PAR FAMILLE */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Analyse de Charge par Famille de Produit
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Volume commande + Charge en cours atelier
              </span>
            </div>

            {!estimationGlobale.hasPieces && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-amber-300 block">
                    Nouvelle commande en cours de création (aucune pièce configurée) :
                  </span>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    L'atelier compte actuellement des ordres de fabrication (OF) et commandes en cours dans sa file de production (détail ci-dessous).
                    La date indiquée correspond à la <strong>disponibilité au plus tôt de l'atelier</strong>.
                    Dès que vous ajouterez vos caissons ou tabliers, leur quantité s'ajoutera automatiquement à la file d'attente existante.
                  </p>
                </div>
              </div>
            )}

            {detailsArray.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 text-center italic">
                Chargement des files de production atelier...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                      <th className="pb-2">Famille</th>
                      <th className="pb-2 text-center">Volume Commande</th>
                      <th className="pb-2 text-center">En cours Atelier</th>
                      <th className="pb-2 text-center">Total Cumulé</th>
                      <th className="pb-2 text-center">Cadence / Jour</th>
                      <th className="pb-2 text-center">Délai Requis</th>
                      <th className="pb-2 text-right">Date Prévue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {detailsArray.map((det) => {
                      const style = getFamilleStyle(det.famille);
                      const isGoulot = estimationGlobale.familleGoulot === det.famille && detailsArray.length > 1;
                      const cap = paramsProd.familles[det.famille]?.capaciteJournalierePieces || 120;
                      const isExpanded = !!expandedFamilles[det.famille];

                      return (
                        <React.Fragment key={det.famille}>
                          <tr className={`hover:bg-slate-900/50 transition ${isGoulot ? 'bg-amber-500/5' : ''}`}>
                            <td className="py-2.5 pr-2 font-sans font-bold">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.text} border ${style.border}`}>
                                  {style.label}
                                </span>
                                {isGoulot && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-black border border-amber-500/40" title="Cette famille impose la date de livraison la plus éloignée pour l'ensemble du dossier">
                                    Goulot
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 text-center font-bold">
                              {det.piecesCommande > 0 ? (
                                <span className="text-emerald-300">{det.piecesCommande} pcs</span>
                              ) : (
                                <span className="text-slate-400">0 pc</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center text-slate-300">
                              <div className="flex items-center justify-center gap-1">
                                <span>+{det.piecesEnFileAttente} pcs</span>
                                {det.ofsDetails && det.ofsDetails.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleFamilleExpanded(det.famille)}
                                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[9px] font-bold border border-slate-700 transition cursor-pointer"
                                    title="Cliquer pour afficher les OFs composant cette charge"
                                  >
                                    {isExpanded ? '▲ Masquer' : `▼ ${det.nbOfsEnCours} OF(s)`}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 text-center font-bold text-cyan-300">
                              = {det.totalPiecesCharge} pcs
                            </td>
                            <td className="py-2.5 text-center text-slate-300">
                              {cap} / j
                            </td>
                            <td className="py-2.5 text-center font-bold text-amber-300">
                              {det.joursOuvresRequis}j ouvré(s)
                            </td>
                            <td className="py-2.5 text-right font-bold text-emerald-300">
                              {det.dateLivraisonFormattee}
                            </td>
                          </tr>

                          {/* Tiroir détaillé des OFs en cours pour cette famille */}
                          {isExpanded && det.ofsDetails && det.ofsDetails.length > 0 && (
                            <tr className="bg-slate-950/80">
                              <td colSpan={7} className="p-2.5">
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                                    <span>Ordres de Fabrication en cours pour {style.label} :</span>
                                    <span className="text-slate-400 font-mono">{det.ofsDetails.length} ordre(s) actif(s) • Total {det.piecesEnFileAttente} pièces</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                                    {det.ofsDetails.map((ofItem, idx) => (
                                      <div key={idx} className="bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center justify-between text-[10px] font-mono">
                                        <span className="text-slate-200 font-bold truncate max-w-[150px]">
                                          {ofItem.codeOF} <span className="text-slate-400 font-normal">({ofItem.numCommande})</span>
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="text-slate-400 truncate max-w-[90px]">{ofItem.nomClient}</span>
                                          <span className="text-amber-300 font-bold px-1 rounded bg-amber-500/10 border border-amber-500/30">
                                            {ofItem.nbPieces} pc{ofItem.nbPieces > 1 ? 's' : ''}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Explication pédagogique de la formule */}
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Formule de livraison atelier :</strong> Le délai de livraison au client est calculé en additionnant le <strong>volume total des commandes déjà en cours à l'atelier</strong> + le <strong>volume de cette commande</strong>, divisé par la <strong>cadence journalière</strong> de chaque famille (en jours ouvrés à compter d'aujourd'hui). L'atelier peut ainsi s'engager sur une date de remise réelle au client tenant compte de sa file de production complète.
              </span>
            </div>
          </div>

          {/* SÉLECTION / AJUSTEMENT DE LA DATE FINALE */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>{estimationGlobale.hasPieces ? 'Date de Livraison Retenue :' : 'Disponibilité Atelier au plus tôt :'}</span>
              </label>
              {modeDate === 'MANUEL' && (
                <button
                  type="button"
                  onClick={resetToAuto}
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold transition"
                  title="Revenir au calcul automatique basé sur la charge"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>↺ Revenir au calcul auto ({estimationGlobale.dateLivraisonFormattee.replace(/^LIVRAISON\s*:\s*/i, '')})</span>
                </button>
              )}
            </div>

            {/* Input Date */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={dateSelectionneeISO}
                onChange={(e) => {
                  setDateSelectionneeISO(e.target.value);
                  setModeDate('MANUEL');
                }}
                className="bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-sm text-amber-200 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <div className="text-xs font-mono font-bold px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200">
                {getDateAfficheeFormatee(dateSelectionneeISO)}
              </div>
              {modeDate === 'AUTO' && (
                <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                  {estimationGlobale.hasPieces ? '✓ Calculé automatiquement par charge cumulée' : '✓ Disponibilité atelier estimée selon file de production'}
                </span>
              )}
            </div>

            {/* Raccourcis Rapides */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Raccourcis Délais Ouvrés :
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(0)}
                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 rounded-lg font-bold text-xs flex items-center gap-1 transition"
                  title="Livraison demandée pour aujourd'hui (urgentissime)"
                >
                  <Zap className="w-3 h-3 fill-rose-400" />
                  <span>Aujourd'hui (Urgent)</span>
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(1)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium text-xs transition"
                >
                  +1j Ouvré
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(2)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium text-xs transition"
                >
                  +2j Ouvrés
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(3)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium text-xs transition"
                >
                  +3j Ouvrés
                </button>
                <button
                  type="button"
                  onClick={() => appliquerRaccourci(5)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium text-xs transition"
                >
                  +5j (1 Semaine)
                </button>
              </div>
            </div>

            {/* Mise en Pause de la Commande */}
            <div className={`p-3 rounded-xl border transition ${
              estEnPause
                ? 'bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/40'
                : 'bg-slate-900/50 border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg ${estEnPause ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                    <PauseCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white block">
                        Mise en Pause de la Commande
                      </span>
                      {estEnPause && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black border border-amber-500/40 animate-pulse">
                          ⏸️ EN PAUSE
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Gèle la production de la commande (ex : rupture matière, attente validation client ou dimensions).
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEstEnPause(!estEnPause)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      estEnPause
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {estEnPause ? (
                      <>
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Reprendre</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5 text-amber-400" />
                        <span>Mettre en Pause</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={estEnPause}
                    onClick={() => setEstEnPause(!estEnPause)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      estEnPause ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        estEnPause ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {estEnPause && (
                <div className="mt-2.5 pt-2 border-t border-amber-500/20 space-y-1.5">
                  <input
                    type="text"
                    value={motifPause}
                    onChange={(e) => setMotifPause(e.target.value)}
                    placeholder="Motif de la mise en pause (ex: Attente profilés 9010, modification côtes client...)"
                    className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1 text-xs text-amber-200 placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-amber-300/80 italic">
                    ℹ️ Les délais de livraison seront gelés et marqués "⏸️ EN PAUSE" sur le planning atelier et le dossier.
                  </p>
                </div>
              )}
            </div>

            {/* Commande Prioritaire */}
            <div className={`p-3 rounded-xl border transition ${
              estPrioritaire
                ? 'bg-rose-950/30 border-rose-500/50'
                : 'bg-slate-900/50 border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${estPrioritaire ? 'fill-rose-400 text-rose-400' : 'text-slate-400'}`} />
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Commande Prioritaire / Urgente
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Passe en tête de file atelier et neutralise le temps d'attente des commandes antérieures.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={estPrioritaire}
                  onClick={() => {
                    const nextPrio = !estPrioritaire;
                    setEstPrioritaire(nextPrio);
                    if (nextPrio && modeDate === 'AUTO') {
                      appliquerRaccourci(1);
                    }
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    estPrioritaire ? 'bg-rose-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      estPrioritaire ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {estPrioritaire && (
                <div className="mt-2.5 pt-2 border-t border-rose-500/20">
                  <input
                    type="text"
                    value={motifPriorite}
                    onChange={(e) => setMotifPriorite(e.target.value)}
                    placeholder="Motif de la priorité (ex: Chantier urgent, dépannage express...)"
                    className="w-full bg-slate-900 border border-rose-500/40 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer avec Boutons d'Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Annuler
            </button>
            {onApplyOnly && (
              <button
                type="button"
                onClick={() => {
                  const txtFormatte = getDateAfficheeFormatee(dateSelectionneeISO);
                  const dateFinaleTexte = estEnPause
                    ? '⏸️ EN PAUSE'
                    : estPrioritaire
                    ? `⚡ PRIORITAIRE : ${txtFormatte.replace(/^LIVRAISON\s*:\s*/i, '')}`
                    : txtFormatte;
                  onApplyOnly(dateSelectionneeISO, dateFinaleTexte, estPrioritaire, motifPriorite, estEnPause, motifPause);
                  onClose();
                }}
                disabled={isSaving || (!dateSelectionneeISO && !estEnPause)}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                title="Appliquer cette date et priorité à la commande sans enregistrer immédiatement"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Appliquer à la Commande</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleValider}
            disabled={isSaving || (!dateSelectionneeISO && !estEnPause)}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-black flex items-center gap-2 shadow-lg transition active:scale-95 ${
              estEnPause
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30'
                : estPrioritaire
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
            } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Enregistrement en cours...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>
                  {estEnPause
                    ? 'Valider la Mise en Pause'
                    : isUpdate
                    ? 'Valider et Mettre à jour'
                    : 'Valider le Délai et Enregistrer'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
