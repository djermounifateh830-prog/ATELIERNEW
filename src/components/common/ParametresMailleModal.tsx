import React, { useState, useEffect } from 'react';
import { ParametresOptimisationMaille } from '../../types';
import { PARAMETRES_MAILLE_DEFAUT } from '../../services/moteurMoustiquaire';
import { Sliders, Check, RotateCcw, X, Info, Scissors, Trash2, ArrowDownToLine } from 'lucide-react';

interface ParametresMailleModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: ParametresOptimisationMaille;
  onSave: (newParams: ParametresOptimisationMaille) => void;
}

export const ParametresMailleModal: React.FC<ParametresMailleModalProps> = ({
  isOpen,
  onClose,
  params,
  onSave
}) => {
  const [ecartMaxPlis, setEcartMaxPlis] = useState<number>(params.ecartMaxPlis ?? 5);
  const [dechetMaxJeteMm, setDechetMaxJeteMm] = useState<number>(params.dechetMaxJeteMm ?? 100);
  const [longueurMinChuteConserveeMm, setLongueurMinChuteConserveeMm] = useState<number>(
    params.longueurMinChuteConserveeMm ?? 1000
  );

  useEffect(() => {
    if (isOpen) {
      setEcartMaxPlis(params.ecartMaxPlis ?? 5);
      setDechetMaxJeteMm(params.dechetMaxJeteMm ?? 100);
      setLongueurMinChuteConserveeMm(params.longueurMinChuteConserveeMm ?? 1000);
    }
  }, [isOpen, params]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ecartMaxPlis: Math.max(0, Math.min(20, ecartMaxPlis)),
      dechetMaxJeteMm: Math.max(0, Math.min(1000, dechetMaxJeteMm)),
      longueurMinChuteConserveeMm: Math.max(100, Math.min(5000, longueurMinChuteConserveeMm))
    });
  };

  const handleReset = () => {
    setEcartMaxPlis(PARAMETRES_MAILLE_DEFAUT.ecartMaxPlis);
    setDechetMaxJeteMm(PARAMETRES_MAILLE_DEFAUT.dechetMaxJeteMm);
    setLongueurMinChuteConserveeMm(PARAMETRES_MAILLE_DEFAUT.longueurMinChuteConserveeMm);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Paramètres d'Optimisation de la Toile Maille
              </h3>
              <p className="text-[11px] text-slate-400">
                Règles de sélection intelligente des chutes vs paquet neuf
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-5 text-xs">
          {/* Paramètre 1 : Écart de plis */}
          <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                Écart max de plis en trop autorisés
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={ecartMaxPlis}
                  onChange={e => setEcartMaxPlis(parseInt(e.target.value, 10) || 0)}
                  className="w-16 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-center font-mono font-bold text-amber-300 text-xs"
                />
                <span className="text-slate-400 font-medium">plis</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Une chute peut avoir jusqu'à <span className="text-amber-400 font-bold">+{ecartMaxPlis} plis</span> en trop que l'ouvrier recoupera au cutter. Priorité aux chutes ayant exactement le bon nombre (0 pli en trop).
            </p>
          </div>

          {/* Paramètre 2 : Déchet max jeté */}
          <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Déchet max jeté à la poubelle
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="10"
                  value={dechetMaxJeteMm}
                  onChange={e => setDechetMaxJeteMm(parseFloat(e.target.value) || 0)}
                  className="w-16 bg-slate-900 border border-rose-500/40 rounded px-2 py-1 text-center font-mono font-bold text-rose-300 text-xs"
                />
                <span className="text-slate-400 font-medium">mm ({Math.round(dechetMaxJeteMm / 10)} cm)</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Si la chute dépasse de moins de <span className="text-rose-400 font-bold">{dechetMaxJeteMm} mm</span>, la coupe est autorisée et cette petite perte est jetée pour éviter d'entamer un rouleau neuf.
            </p>
          </div>

          {/* Paramètre 3 : Longueur min conservée en stock */}
          <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <ArrowDownToLine className="w-3.5 h-3.5 text-sky-400" />
                Reste minimum pour retour en stock
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="200"
                  max="3000"
                  step="50"
                  value={longueurMinChuteConserveeMm}
                  onChange={e => setLongueurMinChuteConserveeMm(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-slate-900 border border-sky-500/40 rounded px-2 py-1 text-center font-mono font-bold text-sky-300 text-xs"
                />
                <span className="text-slate-400 font-medium">mm ({(longueurMinChuteConserveeMm / 1000).toFixed(1)} m)</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Si la chute est grande et laisse un reste d'au moins <span className="text-sky-400 font-bold">{longueurMinChuteConserveeMm} mm</span>, la coupe est validée et le morceau restant est réinjecté dans le stock.
            </p>
          </div>

          {/* Règle de protection contre le gaspillage */}
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-200 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 block mb-0.5">Protection contre le gaspillage :</strong>
              Toute chute dont la perte se situe entre <span className="font-bold">{dechetMaxJeteMm} mm</span> et <span className="font-bold">{longueurMinChuteConserveeMm} mm</span> sera automatiquement <span className="font-bold text-rose-300">refusée</span> pour ne pas la sacrifier, et le logiciel basculera sur un <span className="font-bold text-sky-300">paquet neuf</span>.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-t border-slate-800">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Valeurs par défaut
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Appliquer les paramètres
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
