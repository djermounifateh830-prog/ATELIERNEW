import React, { useState, useMemo } from 'react';
import { Search, X, Layers, Plus, PackageCheck, AlertCircle } from 'lucide-react';
import { ChuteItem } from '../../../types';

interface ChuteRackPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRackChute: (chute: ChuteItem) => void;
  onSelectHorsStockChute: (longueurMm: number, remarque?: string) => void;
  articleDesignation: string;
  articleCode: string;
  sheetName: string;
  chutesBarres: Record<string, ChuteItem[]>;
  alreadyUsedChuteIds: Set<string>;
}

export const ChuteRackPickerModal: React.FC<ChuteRackPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectRackChute,
  onSelectHorsStockChute,
  articleDesignation,
  articleCode,
  sheetName,
  chutesBarres,
  alreadyUsedChuteIds
}) => {
  const [activeTab, setActiveTab] = useState<'RACK' | 'HORS_STOCK'>('RACK');
  const [searchQuery, setSearchQuery] = useState('');
  const [horsStockLg, setHorsStockLg] = useState('');
  const [horsStockRemarque, setHorsStockRemarque] = useState('');

  // Trouver les chutes correspondant à cette feuille ou cet article
  const chutesDisponibles = useMemo(() => {
    // Essayer par sheetName exact, ou clés partielles
    let list: ChuteItem[] = [];
    if (chutesBarres[sheetName]) {
      list = chutesBarres[sheetName];
    } else {
      // Rechercher dans les feuilles de chutesBarres
      const lowerSheet = sheetName.toLowerCase();
      const lowerCode = articleCode.toLowerCase();
      for (const [sName, items] of Object.entries(chutesBarres)) {
        if (sName.toLowerCase() === lowerSheet || sName.toLowerCase().includes(lowerCode)) {
          list = items;
          break;
        }
      }
    }

    // Exclure les chutes déjà réservées / utilisées
    return list
      .filter(c => {
        if (c.id && alreadyUsedChuteIds.has(c.id)) return false;
        return (c.quantite ?? 1) > 0;
      })
      .sort((a, b) => b.longueur - a.longueur);
  }, [chutesBarres, sheetName, articleCode, alreadyUsedChuteIds]);

  const chutesFiltrees = useMemo(() => {
    if (!searchQuery.trim()) return chutesDisponibles;
    const q = searchQuery.toLowerCase().trim();
    return chutesDisponibles.filter(c => {
      const lgStr = String(c.longueur);
      return lgStr.includes(q) || (c.id && c.id.toLowerCase().includes(q));
    });
  }, [chutesDisponibles, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Choisir une Chute de Remplacement
              </h3>
              <p className="text-xs text-slate-400">
                Profilé : <span className="text-amber-300 font-semibold">{articleDesignation}</span> ({sheetName})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-5 pt-3 pb-2 flex gap-2 border-b border-slate-800 bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('RACK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'RACK'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>Chutes du Rack Inventoriées ({chutesDisponibles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HORS_STOCK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'HORS_STOCK'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Chute Hors-Stock (Non Inventoriée)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {activeTab === 'RACK' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Rechercher par longueur (ex: 1850)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              {chutesFiltrees.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/40 rounded-xl border border-slate-800/80 p-4">
                  <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-300 font-semibold">Aucune chute disponible dans ce rack</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Toutes les chutes de {sheetName} sont soit réservées, soit épuisées.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('HORS_STOCK')}
                    className="mt-3 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition"
                  >
                    Saisir une chute hors-stock trouvée à l'atelier
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {chutesFiltrees.map((chute, idx) => (
                    <button
                      key={chute.id || idx}
                      type="button"
                      onClick={() => {
                        onSelectRackChute(chute);
                        onClose();
                      }}
                      className="p-3 bg-slate-950 hover:bg-sky-950/40 border border-slate-800 hover:border-sky-500/50 rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
                    >
                      <div>
                        <div className="text-sm font-black text-slate-100 font-mono group-hover:text-sky-300">
                          {chute.longueur} mm
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Dispo : <span className="text-slate-200 font-semibold">{chute.quantite} pcs</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-sky-400 px-2 py-1 bg-sky-950 rounded-lg border border-sky-800/50 group-hover:bg-sky-500 group-hover:text-slate-950 transition">
                        Choisir
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200/90 leading-relaxed">
                Utilisez cette option si l'opérateur a trouvé dans l'atelier un morceau de profilé qui n'était pas enregistré dans le rack. Le système créera une régularisation automatique dans les mouvements de stock.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Longueur mesurée au mètre ruban (mm) *
                </label>
                <input
                  type="number"
                  placeholder="ex: 1750"
                  value={horsStockLg}
                  onChange={e => setHorsStockLg(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Remarque / Localisation (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: Retrouvée au pied de la tronçonneuse"
                  value={horsStockRemarque}
                  onChange={e => setHorsStockRemarque(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="button"
                disabled={!horsStockLg || Number(horsStockLg) <= 0}
                onClick={() => {
                  const val = Number(horsStockLg);
                  if (val > 0) {
                    onSelectHorsStockChute(val, horsStockRemarque.trim() || undefined);
                    onClose();
                  }
                }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                Valider l'utilisation de cette chute hors-stock
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
