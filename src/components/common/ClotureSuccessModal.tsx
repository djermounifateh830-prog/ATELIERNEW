import React from 'react';
import { CheckCircle2, PackageCheck, Layers, ArrowRight, X, Sparkles, User, Calendar } from 'lucide-react';
import { userService } from '../../services/userService';

interface ClotureSuccessModalProps {
  isOpen: boolean;
  codeOF: string;
  numCommande: string;
  nomClient?: string;
  titreSection?: string;
  stats?: {
    barresNeuves?: number;
    chutesDebitees?: number;
    chutesGenerees?: number;
    accessoires?: number;
  };
  onFermerOF: () => void;
  onAllerAuxOrdresEnCours?: () => void;
}

export const ClotureSuccessModal: React.FC<ClotureSuccessModalProps> = ({
  isOpen,
  codeOF,
  numCommande,
  nomClient,
  titreSection,
  stats,
  onFermerOF,
  onAllerAuxOrdresEnCours
}) => {
  if (!isOpen) return null;

  const activeOp = userService.getActiveOperator();
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl w-full max-w-lg shadow-2xl shadow-emerald-950/50 overflow-hidden text-slate-100 transform scale-100 transition-all">
        {/* En-tête décoré */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-6 text-center relative">
          <button
            type="button"
            onClick={onFermerOF}
            className="absolute top-4 right-4 text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/80 p-1.5 rounded-full transition cursor-pointer"
            title="Fermer l'OF"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/40 text-emerald-200 text-xs font-black uppercase tracking-wider mb-2 border border-emerald-400/30">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Clôture Enregistrée</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            OF Clôturé avec Succès !
          </h2>
          <p className="text-xs text-emerald-100 mt-1 max-w-sm mx-auto">
            Les stocks de profilés neufs ont été débités et les chutes ont été intégrées à l'inventaire de l'atelier.
          </p>
        </div>

        {/* Corps avec les détails */}
        <div className="p-6 space-y-4">
          {/* Fiche récapitulative de l'OF */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <span className="text-xs font-bold text-slate-400">Ordre de Fabrication</span>
              <span className="px-2.5 py-1 bg-amber-400 text-slate-950 font-black font-mono text-xs rounded-lg shadow-xs">
                {codeOF || 'OF'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Commande</span>
              <span className="font-mono font-bold text-slate-200">{numCommande || '—'}</span>
            </div>

            {nomClient && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Client</span>
                <span className="font-semibold text-slate-200 truncate max-w-[200px]">{nomClient}</span>
              </div>
            )}

            {titreSection && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Section</span>
                <span className="text-slate-300 truncate max-w-[200px]">{titreSection}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs border-t border-slate-800/80 pt-2 text-slate-400">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-500" />
                Opérateur : <strong className="text-slate-300 font-semibold">{activeOp.nom}</strong>
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                <Calendar className="w-3 h-3 text-slate-500" />
                {dateStr}
              </span>
            </div>
          </div>

          {/* Statistiques clés de la clôture */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
              {stats.barresNeuves !== undefined && (
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-400 font-semibold">Barres Débitées</div>
                  <div className="text-lg font-black text-emerald-400 font-mono">
                    {stats.barresNeuves}
                  </div>
                </div>
              )}

              {stats.chutesDebitees !== undefined && (
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-400 font-semibold">Chutes Réutilisées</div>
                  <div className="text-lg font-black text-sky-400 font-mono">
                    {stats.chutesDebitees}
                  </div>
                </div>
              )}

              {stats.chutesGenerees !== undefined && (
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-400 font-semibold">Chutes au Rack</div>
                  <div className="text-lg font-black text-amber-400 font-mono">
                    +{stats.chutesGenerees}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Boutons d'Action */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={onFermerOF}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Fermer cet OF</span>
            </button>

            {onAllerAuxOrdresEnCours && (
              <button
                type="button"
                onClick={() => {
                  onFermerOF();
                  onAllerAuxOrdresEnCours();
                }}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700"
              >
                <span>Aller à la liste des Ordres en Cours</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
